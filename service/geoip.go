package service

import (
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/ip2location/ip2location-go/v9"
	"github.com/oschwald/maxminddb-golang"
)

// GeoInfo IP 地理与运营商解析结果
type GeoInfo struct {
	Country   string
	Region    string // 省/州（写入前经 ApplyGeoZh 中文化）
	RegionISO string // 省/州 ISO，如 GD
	City      string
	ASN       uint
	ASOrg     string
}

type geoIPSuite struct {
	dataDir string
	mu      sync.RWMutex
	binV4   *binHandle
	binV6   *binHandle
	asn     *mmdbHandle
	country *mmdbHandle // 可选：BIN 未命中时国家兜底
}

type binHandle struct {
	path string
	db   *ip2location.DB
	mod  time.Time
}

type mmdbHandle struct {
	path string
	db   *maxminddb.Reader
	mod  time.Time
}

func newGeoIPSuite(dataDir string) *geoIPSuite {
	s := &geoIPSuite{dataDir: dataDir}
	s.binV4 = &binHandle{path: filepath.Join(dataDir, "IP2LOCATION-LITE-DB3.BIN")}
	s.binV6 = &binHandle{path: filepath.Join(dataDir, "IP2LOCATION-LITE-DB3.IPV6.BIN")}
	s.asn = &mmdbHandle{path: filepath.Join(dataDir, "GeoLite2-ASN.mmdb")}
	s.country = &mmdbHandle{path: filepath.Join(dataDir, "GeoLite2-Country.mmdb")}
	s.openAll()
	return s
}

func (s *geoIPSuite) openAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	openBIN(s.binV4)
	openBIN(s.binV6)
	openMMDB(s.asn)
	openMMDB(s.country)
}

func openBIN(h *binHandle) {
	if h == nil {
		return
	}
	st, err := os.Stat(h.path)
	if err != nil {
		closeBIN(h)
		return
	}
	if h.db != nil && st.ModTime().Equal(h.mod) {
		return
	}
	db, err := ip2location.OpenDB(h.path)
	if err != nil {
		closeBIN(h)
		return
	}
	closeBIN(h)
	h.db = db
	h.mod = st.ModTime()
}

func closeBIN(h *binHandle) {
	if h != nil && h.db != nil {
		h.db.Close()
		h.db = nil
	}
}

func openMMDB(h *mmdbHandle) {
	if h == nil {
		return
	}
	st, err := os.Stat(h.path)
	if err != nil {
		closeMMDB(h)
		return
	}
	if h.db != nil && st.ModTime().Equal(h.mod) {
		return
	}
	db, err := maxminddb.Open(h.path)
	if err != nil {
		closeMMDB(h)
		return
	}
	closeMMDB(h)
	h.db = db
	h.mod = st.ModTime()
}

func closeMMDB(h *mmdbHandle) {
	if h != nil && h.db != nil {
		_ = h.db.Close()
		h.db = nil
	}
}

func (s *geoIPSuite) ReloadIfNeeded() {
	s.mu.Lock()
	defer s.mu.Unlock()
	reloadBIN(s.binV4)
	reloadBIN(s.binV6)
	reloadMMDB(s.asn)
	reloadMMDB(s.country)
}

func reloadBIN(h *binHandle) {
	if h == nil {
		return
	}
	st, err := os.Stat(h.path)
	if err != nil {
		closeBIN(h)
		return
	}
	if h.db != nil && st.ModTime().Equal(h.mod) {
		return
	}
	openBIN(h)
}

func reloadMMDB(h *mmdbHandle) {
	if h == nil {
		return
	}
	st, err := os.Stat(h.path)
	if err != nil {
		closeMMDB(h)
		return
	}
	if h.db != nil && st.ModTime().Equal(h.mod) {
		return
	}
	openMMDB(h)
}

func (s *geoIPSuite) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	closeBIN(s.binV4)
	closeBIN(s.binV6)
	closeMMDB(s.asn)
	closeMMDB(s.country)
}

func (s *geoIPSuite) BINV4Available() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.binV4 != nil && s.binV4.db != nil
}

func (s *geoIPSuite) BINV6Available() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.binV6 != nil && s.binV6.db != nil
}

func (s *geoIPSuite) ASNAvailable() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.asn != nil && s.asn.db != nil
}

func (s *geoIPSuite) CountryAvailable() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.country != nil && s.country.db != nil
}

func (s *geoIPSuite) AnyAvailable() bool {
	return s.BINV4Available() || s.BINV6Available() || s.ASNAvailable() || s.CountryAvailable()
}

// Paths 返回 v4 BIN、v6 BIN、ASN、Country 兜底库路径
func (s *geoIPSuite) Paths() (v4, v6, asn, country string) {
	return filepath.Join(s.dataDir, "IP2LOCATION-LITE-DB3.BIN"),
		filepath.Join(s.dataDir, "IP2LOCATION-LITE-DB3.IPV6.BIN"),
		filepath.Join(s.dataDir, "GeoLite2-ASN.mmdb"),
		filepath.Join(s.dataDir, "GeoLite2-Country.mmdb")
}

type geoCountryOnlyRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
}

type geoASNRecord struct {
	AutonomousSystemNumber       uint   `maxminddb:"autonomous_system_number"`
	AutonomousSystemOrganization string `maxminddb:"autonomous_system_organization"`
}

// Lookup 解析 IP 地理与 ASN（BIN 负责国家/省/市，ASN 独立查询）
func (s *geoIPSuite) Lookup(ipStr string) GeoInfo {
	var out GeoInfo
	ip := net.ParseIP(ipStr)
	if ip == nil || s == nil {
		return out
	}

	s.mu.RLock()
	v4DB := (*ip2location.DB)(nil)
	v6DB := (*ip2location.DB)(nil)
	asnDB := (*maxminddb.Reader)(nil)
	countryDB := (*maxminddb.Reader)(nil)
	if s.binV4 != nil {
		v4DB = s.binV4.db
	}
	if s.binV6 != nil {
		v6DB = s.binV6.db
	}
	if s.asn != nil {
		asnDB = s.asn.db
	}
	if s.country != nil {
		countryDB = s.country.db
	}
	s.mu.RUnlock()

	binDB := v6DB
	if ip.To4() != nil {
		binDB = v4DB
	}
	if binDB != nil {
		rec, err := binDB.Get_all(ipStr)
		if err == nil {
			out.Country = normalizeCountryCode(rec.Country_short)
			out.Region = strings.TrimSpace(rec.Region)
			out.City = strings.TrimSpace(rec.City)
		}
	}

	if out.Country == "" && countryDB != nil {
		var rec geoCountryOnlyRecord
		if err := countryDB.Lookup(ip, &rec); err == nil {
			out.Country = normalizeCountryCode(rec.Country.ISOCode)
		}
	}

	if asnDB != nil {
		var rec geoASNRecord
		if err := asnDB.Lookup(ip, &rec); err == nil {
			out.ASN = rec.AutonomousSystemNumber
			out.ASOrg = strings.TrimSpace(rec.AutonomousSystemOrganization)
		}
	}

	ApplyGeoZh(&out)
	return out
}

// GeoIPService 对外暴露的 Geo 查询（诊断命令等）
type GeoIPService struct {
	inner *geoIPSuite
}

// NewGeoIPService 打开数据目录下的 BIN/MMDB
func NewGeoIPService(dataDir string) *GeoIPService {
	return &GeoIPService{inner: newGeoIPSuite(dataDir)}
}

func (s *GeoIPService) Close() {
	if s != nil && s.inner != nil {
		s.inner.Close()
	}
}

func (s *GeoIPService) Lookup(ip string) GeoInfo {
	if s == nil || s.inner == nil {
		return GeoInfo{}
	}
	return s.inner.Lookup(ip)
}

func (s *GeoIPService) Paths() (v4, v6, asn, country string) {
	if s == nil || s.inner == nil {
		return "", "", "", ""
	}
	return s.inner.Paths()
}

func (s *GeoIPService) BINV4Available() bool {
	if s == nil || s.inner == nil {
		return false
	}
	return s.inner.BINV4Available()
}

func (s *GeoIPService) BINV6Available() bool {
	if s == nil || s.inner == nil {
		return false
	}
	return s.inner.BINV6Available()
}

func (s *GeoIPService) ASNAvailable() bool {
	if s == nil || s.inner == nil {
		return false
	}
	return s.inner.ASNAvailable()
}

func (s *GeoIPService) CountryAvailable() bool {
	if s == nil || s.inner == nil {
		return false
	}
	return s.inner.CountryAvailable()
}
