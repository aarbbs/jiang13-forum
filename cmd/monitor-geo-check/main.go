// 只读诊断：检查 Geo 库与 page_views 地理字段，或对指定 IP 试查中文映射结果。
//
//	go run ./cmd/monitor-geo-check -db data/monitor.db
//	go run ./cmd/monitor-geo-check -db data/monitor.db -ip 14.109.35.246
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/service"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	dbPath := flag.String("db", filepath.Join("data", "monitor.db"), "含 page_views 的 SQLite（默认 data/monitor.db）")
	ipLookup := flag.String("ip", "", "对指定 IP 试查 BIN+ASN（不写库）")
	flag.Parse()

	abs, err := filepath.Abs(*dbPath)
	if err != nil {
		fatalf("解析路径失败: %v", err)
	}
	dataDir := filepath.Dir(abs)

	if *ipLookup == "" {
		if st, err := os.Stat(abs); err != nil || st.IsDir() {
			fatalf("数据库不存在: %s", abs)
		}
	}

	fmt.Printf("数据库: %s\n", abs)
	fmt.Printf("数据目录: %s\n\n", dataDir)

	suite := service.NewGeoIPService(dataDir)
	defer suite.Close()
	printGeoFiles(dataDir, suite)

	if ip := strings.TrimSpace(*ipLookup); ip != "" {
		lookupIP(suite, ip)
		fmt.Println()
		if _, err := os.Stat(abs); err != nil {
			return
		}
	}

	db, err := gorm.Open(sqlite.Open(abs), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		fatalf("打开数据库失败: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		fatalf("获取连接失败: %v", err)
	}
	defer sqlDB.Close()
	sqlDB.SetMaxOpenConns(1)

	if !tableExists(db, "page_views") {
		fatalf("表 page_views 不存在（请确认指向 data/monitor.db，或尚未写入过浏览量）")
	}

	have := columnSet(db)
	printColumnPresence(have)

	since := time.Now().AddDate(0, 0, -30)
	var total, recentNonBot, withCountry, withRegion, withCity, withASN int64
	_ = db.Table("page_views").Count(&total).Error
	_ = db.Table("page_views").Where("created_at >= ? AND is_bot = ?", since, false).Count(&recentNonBot).Error

	fmt.Println("=== page_views 统计（近 30 日非 bot）===")
	fmt.Printf("总量:           %d\n", total)
	fmt.Printf("近 30 日非 bot: %d\n", recentNonBot)

	if have["country"] {
		_ = db.Table("page_views").Where("created_at >= ? AND is_bot = ? AND country <> ''", since, false).Count(&withCountry).Error
		fmt.Printf("有国家:         %d\n", withCountry)
	} else {
		fmt.Println("有国家:         (列缺失)")
	}
	if have["region"] || have["region_iso"] {
		cond := "created_at >= ? AND is_bot = ?"
		parts := []string{}
		if have["region"] {
			parts = append(parts, "region <> ''")
		}
		if have["region_iso"] {
			parts = append(parts, "region_iso <> ''")
		}
		_ = db.Table("page_views").
			Where(cond+" AND ("+strings.Join(parts, " OR ")+")", since, false).
			Count(&withRegion).Error
		fmt.Printf("有省字段:       %d\n", withRegion)
	} else {
		fmt.Println("有省字段:       (列缺失)")
	}
	if have["city"] {
		_ = db.Table("page_views").Where("created_at >= ? AND is_bot = ? AND city <> ''", since, false).Count(&withCity).Error
		fmt.Printf("有城市:         %d\n", withCity)
	} else {
		fmt.Println("有城市:         (列缺失)")
	}
	if have["asn"] {
		_ = db.Table("page_views").Where("created_at >= ? AND is_bot = ? AND asn > 0", since, false).Count(&withASN).Error
		fmt.Printf("有 ASN:         %d\n", withASN)
	} else {
		fmt.Println("有 ASN:         (列缺失)")
	}
	fmt.Println()

	fmt.Println("=== 近 30 日省级 Top（country / region / region_iso）===")
	if !(have["region"] || have["region_iso"]) {
		fmt.Println("(省列尚未迁移，跳过)")
	} else {
		type regionRow struct {
			Country   string
			Region    string
			RegionISO string `gorm:"column:region_iso"`
			Count     int64
		}
		parts := []string{}
		if have["region"] {
			parts = append(parts, "region <> ''")
		}
		if have["region_iso"] {
			parts = append(parts, "region_iso <> ''")
		}
		selParts := []string{}
		groupParts := []string{}
		if have["country"] {
			selParts = append(selParts, "country")
			groupParts = append(groupParts, "country")
		} else {
			selParts = append(selParts, "'' as country")
		}
		if have["region"] {
			selParts = append(selParts, "region")
			groupParts = append(groupParts, "region")
		} else {
			selParts = append(selParts, "'' as region")
		}
		if have["region_iso"] {
			selParts = append(selParts, "region_iso")
			groupParts = append(groupParts, "region_iso")
		} else {
			selParts = append(selParts, "'' as region_iso")
		}
		selParts = append(selParts, "COUNT(*) as count")
		var regions []regionRow
		_ = db.Table("page_views").
			Select(strings.Join(selParts, ", ")).
			Where("created_at >= ? AND is_bot = ? AND ("+strings.Join(parts, " OR ")+")", since, false).
			Group(strings.Join(groupParts, ", ")).
			Order("count DESC").
			Limit(20).
			Scan(&regions).Error
		if len(regions) == 0 {
			fmt.Println("(空)")
		} else {
			for i, r := range regions {
				fmt.Printf("%2d. %s | %s | %s | %d\n", i+1, r.Country, r.Region, r.RegionISO, r.Count)
			}
		}
	}
	fmt.Println()

	fmt.Println("=== 样例行（近 30 日，最多 10 条）===")
	cols := []string{"id", "created_at", "path", "is_bot"}
	for _, c := range []string{"ip", "country", "region", "region_iso", "city", "asn", "as_org"} {
		if have[c] {
			cols = append(cols, c)
		}
	}
	type sample struct {
		ID        uint
		CreatedAt time.Time
		IP        string
		Country   string
		Region    string
		RegionISO string `gorm:"column:region_iso"`
		City      string
		ASN       uint
		ASOrg     string `gorm:"column:as_org"`
		Path      string
		IsBot     bool
	}
	var samples []sample
	_ = db.Table("page_views").
		Select(strings.Join(cols, ", ")).
		Where("created_at >= ?", since).
		Order("id DESC").
		Limit(10).
		Scan(&samples).Error
	if len(samples) == 0 {
		fmt.Println("(无近 30 日 pageview)")
	} else {
		for _, s := range samples {
			fmt.Printf("#%d %s ip=%s country=%q region=%q iso=%q city=%q asn=%d org=%q bot=%v path=%s\n",
				s.ID, s.CreatedAt.Format("2006-01-02 15:04:05"), s.IP,
				s.Country, s.Region, s.RegionISO, s.City, s.ASN, s.ASOrg, s.IsBot, s.Path)
		}
	}

	regionReady := have["region"] || have["region_iso"]
	if !regionReady || withRegion == 0 {
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "提示: 近 30 日无省级字段。中国地图「暂无省级访问数据」属预期。")
		if !regionReady {
			fmt.Fprintln(os.Stderr, "当前库缺 region/region_iso 列：请先启动一次主程序以完成 AutoMigrate。")
		}
		fmt.Fprintln(os.Stderr, "请确认数据目录已放置 IP2LOCATION-LITE-DB3.BIN 与 GeoLite2-ASN.mmdb，且有公网访问产生的 pageview。")
		fmt.Fprintln(os.Stderr, "本机/私网 IP 通常解不出省，属正常。")
		os.Exit(2)
	}
}

func printGeoFiles(dataDir string, suite *service.GeoIPService) {
	fmt.Println("=== Geo 数据文件 ===")
	v4, v6, asn, country := suite.Paths()
	for _, item := range []struct {
		name string
		path string
		ok   bool
	}{
		{"IP2LOCATION-LITE-DB3.BIN", v4, suite.BINV4Available()},
		{"IP2LOCATION-LITE-DB3.IPV6.BIN", v6, suite.BINV6Available()},
		{"GeoLite2-ASN.mmdb", asn, suite.ASNAvailable()},
		{"GeoLite2-Country.mmdb", country, suite.CountryAvailable()},
	} {
		st, err := os.Stat(item.path)
		if err != nil {
			fmt.Printf("%s: 不存在\n", item.name)
			continue
		}
		loaded := "未加载"
		if item.ok {
			loaded = "已加载"
		}
		fmt.Printf("%s: 存在 (%d bytes, mtime %s) · %s\n", item.name, st.Size(), st.ModTime().Format(time.RFC3339), loaded)
	}
	fmt.Println()
}

func lookupIP(suite *service.GeoIPService, ipStr string) {
	fmt.Printf("=== IP 试查 %s（中文映射后）===\n", ipStr)
	info := suite.Lookup(ipStr)
	if info.Country == "" && info.Region == "" && info.City == "" && info.ASN == 0 {
		fmt.Println("未解析到地理信息（请确认 BIN/ASN 文件存在且 IP 为公网地址）")
		return
	}
	fmt.Printf("国家 ISO: %s (%s)\n", info.Country, service.CountryLabelZh(info.Country))
	if info.Region != "" || info.RegionISO != "" {
		fmt.Printf("省/州: %s / %s\n", info.Region, info.RegionISO)
	}
	if info.City != "" {
		fmt.Printf("城市: %s\n", info.City)
	}
	if info.ASN > 0 || info.ASOrg != "" {
		fmt.Printf("ASN: AS%d %s\n", info.ASN, info.ASOrg)
	}
}

func tableExists(db *gorm.DB, name string) bool {
	var n int
	err := db.Raw(
		`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, name,
	).Scan(&n).Error
	return err == nil && n > 0
}

func columnSet(db *gorm.DB) map[string]bool {
	type colRow struct {
		Name string `gorm:"column:name"`
	}
	var cols []colRow
	_ = db.Raw(`PRAGMA table_info(page_views)`).Scan(&cols).Error
	have := map[string]bool{}
	for _, c := range cols {
		have[c.Name] = true
	}
	return have
}

func printColumnPresence(have map[string]bool) {
	need := []string{"ip", "country", "region", "region_iso", "city", "asn", "as_org"}
	fmt.Println("=== page_views 列 ===")
	missing := false
	for _, n := range need {
		if have[n] {
			fmt.Printf("%s: 有\n", n)
		} else {
			fmt.Printf("%s: 缺失\n", n)
			missing = true
		}
	}
	fmt.Println()
	if missing {
		fmt.Fprintln(os.Stderr, "提示: 缺列时请先启动一次主程序以完成监控库 AutoMigrate。")
		fmt.Fprintln(os.Stderr, "")
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
