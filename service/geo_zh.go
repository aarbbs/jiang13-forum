package service

import (
	"strconv"
	"strings"
)

// countryZh ISO2 → 中文国名（展示用；存储仍用 ISO）
var countryZh = map[string]string{
	"CN": "中国", "HK": "中国香港", "MO": "中国澳门", "TW": "中国台湾",
	"US": "美国", "JP": "日本", "KR": "韩国", "SG": "新加坡",
	"GB": "英国", "DE": "德国", "FR": "法国", "RU": "俄罗斯",
	"CA": "加拿大", "AU": "澳大利亚", "IN": "印度", "TH": "泰国",
	"VN": "越南", "MY": "马来西亚", "ID": "印度尼西亚", "PH": "菲律宾",
	"NL": "荷兰", "IT": "意大利", "ES": "西班牙", "BR": "巴西",
	"MX": "墨西哥", "SE": "瑞典", "CH": "瑞士", "PL": "波兰",
	"TR": "土耳其", "SA": "沙特阿拉伯", "AE": "阿联酋", "NZ": "新西兰",
	"IE": "爱尔兰", "BE": "比利时", "AT": "奥地利", "NO": "挪威",
	"DK": "丹麦", "FI": "芬兰", "PT": "葡萄牙", "CZ": "捷克",
	"UA": "乌克兰", "IL": "以色列", "ZA": "南非", "AR": "阿根廷",
}

type cnRegionMeta struct {
	Name string
	ISO  string
}

// cnRegionMap 中国省级英文名/别名 → 中文名 + 地图 ISO
var cnRegionMap = map[string]cnRegionMeta{
	"beijing": {Name: "北京", ISO: "BJ"},
	"peking":  {Name: "北京", ISO: "BJ"},
	"tianjin": {Name: "天津", ISO: "TJ"},
	"shanghai": {Name: "上海", ISO: "SH"},
	"chongqing": {Name: "重庆", ISO: "CQ"},
	"chungking": {Name: "重庆", ISO: "CQ"},
	"hebei":     {Name: "河北", ISO: "HE"},
	"shanxi":    {Name: "山西", ISO: "SX"},
	"liaoning":  {Name: "辽宁", ISO: "LN"},
	"jilin":     {Name: "吉林", ISO: "JL"},
	"heilongjiang": {Name: "黑龙江", ISO: "HL"},
	"jiangsu":   {Name: "江苏", ISO: "JS"},
	"zhejiang":  {Name: "浙江", ISO: "ZJ"},
	"anhui":     {Name: "安徽", ISO: "AH"},
	"fujian":    {Name: "福建", ISO: "FJ"},
	"jiangxi":   {Name: "江西", ISO: "JX"},
	"shandong":  {Name: "山东", ISO: "SD"},
	"henan":     {Name: "河南", ISO: "HA"},
	"hubei":     {Name: "湖北", ISO: "HB"},
	"hunan":     {Name: "湖南", ISO: "HN"},
	"guangdong": {Name: "广东", ISO: "GD"},
	"guangxi":   {Name: "广西", ISO: "GX"},
	"hainan":    {Name: "海南", ISO: "HI"},
	"sichuan":   {Name: "四川", ISO: "SC"},
	"guizhou":   {Name: "贵州", ISO: "GZ"},
	"yunnan":    {Name: "云南", ISO: "YN"},
	"xizang":    {Name: "西藏", ISO: "XZ"},
	"tibet":     {Name: "西藏", ISO: "XZ"},
	"shaanxi":   {Name: "陕西", ISO: "SN"},
	"shaanxi province": {Name: "陕西", ISO: "SN"},
	"gansu":     {Name: "甘肃", ISO: "GS"},
	"qinghai":   {Name: "青海", ISO: "QH"},
	"ningxia":   {Name: "宁夏", ISO: "NX"},
	"xinjiang":  {Name: "新疆", ISO: "XJ"},
	"inner mongolia": {Name: "内蒙古", ISO: "NM"},
	"nei mongol": {Name: "内蒙古", ISO: "NM"},
	"hong kong": {Name: "香港", ISO: "HK"},
	"macau":     {Name: "澳门", ISO: "MO"},
	"macao":     {Name: "澳门", ISO: "MO"},
	"taiwan":    {Name: "台湾", ISO: "TW"},
}

// cityZh 常见城市英文名 → 中文
var cityZh = map[string]string{
	"beijing": "北京", "peking": "北京",
	"shanghai": "上海",
	"chongqing": "重庆", "chungking": "重庆",
	"tianjin": "天津",
	"hangzhou": "杭州",
	"shenzhen": "深圳",
	"guangzhou": "广州", "canton": "广州",
	"chengdu": "成都",
	"wuhan": "武汉",
	"xi'an": "西安", "xian": "西安",
	"nanjing": "南京", "nanking": "南京",
	"suzhou": "苏州",
	"qingdao": "青岛",
	"dalian": "大连",
	"ningbo": "宁波",
	"xiamen": "厦门", "amoy": "厦门",
	"changsha": "长沙",
	"zhengzhou": "郑州",
	"jinan": "济南",
	"harbin": "哈尔滨",
	"shenyang": "沈阳",
	"kunming": "昆明",
	"nanning": "南宁",
	"urumqi": "乌鲁木齐",
	"lhasa": "拉萨",
	"hohhot": "呼和浩特",
	"taipei": "台北",
	"hong kong": "香港",
}

// asnOrgZh 常见 ASN / AS 组织名 → 中文运营商
var asnOrgZh = map[uint]string{
	4134:  "中国电信",
	4812:  "中国电信",
	4837:  "中国联通",
	4808:  "中国联通",
	9808:  "中国移动",
	56040: "中国移动",
	56041: "中国移动",
	56042: "中国移动",
	4538:  "教育网",
	23910: "教育网",
	58539: "教育网",
	7497:  "教育网",
}

var asnOrgKeywordZh = []struct {
	kw string
	zh string
}{
	{"chinanet", "中国电信"},
	{"china telecom", "中国电信"},
	{"chinatelecom", "中国电信"},
	{"unicom", "中国联通"},
	{"china unicom", "中国联通"},
	{"mobile", "中国移动"},
	{"china mobile", "中国移动"},
	{"cernet", "教育网"},
	{"education", "教育网"},
}

// CountryLabelZh ISO2 → 中文国名（未知则返回原码）
func CountryLabelZh(iso string) string {
	iso = strings.ToUpper(strings.TrimSpace(iso))
	if iso == "" {
		return ""
	}
	if v, ok := countryZh[iso]; ok {
		return v
	}
	return iso
}

// ApplyGeoZh 就地补充中文省/市/运营商；country 保持 ISO2
func ApplyGeoZh(g *GeoInfo) {
	if g == nil {
		return
	}
	g.Country = normalizeCountryCode(g.Country)
	if g.Country == "CN" || g.Country == "HK" || g.Country == "MO" || g.Country == "TW" {
		mapCNRegionCity(g)
	}
	if g.ASN > 0 {
		if zh, ok := asnOrgZh[g.ASN]; ok {
			g.ASOrg = zh
		} else if g.ASOrg != "" {
			g.ASOrg = mapASOrgZh(g.ASOrg)
		}
	} else if g.ASOrg != "" {
		g.ASOrg = mapASOrgZh(g.ASOrg)
	}
	g.Region = truncateRunes(strings.TrimSpace(g.Region), 64)
	g.City = truncateRunes(strings.TrimSpace(g.City), 64)
	g.ASOrg = truncateRunes(strings.TrimSpace(g.ASOrg), 128)
}

func mapCNRegionCity(g *GeoInfo) {
	if g.RegionISO == "" {
		if meta, ok := lookupCNRegion(g.Region); ok {
			g.Region = meta.Name
			g.RegionISO = meta.ISO
		}
	} else if g.Region != "" {
		if meta, ok := lookupCNRegion(g.Region); ok {
			if g.RegionISO == "" {
				g.RegionISO = meta.ISO
			}
			g.Region = meta.Name
		}
	} else if g.RegionISO != "" {
		for _, meta := range cnRegionMap {
			if meta.ISO == strings.ToUpper(g.RegionISO) {
				g.Region = meta.Name
				break
			}
		}
	}
	if g.City != "" {
		if zh, ok := lookupCityZh(g.City); ok {
			g.City = zh
		}
	}
	// 直辖市：BIN 有时只给城市不给省
	if g.Region == "" && g.City != "" {
		switch g.City {
		case "北京", "上海", "天津", "重庆":
			g.Region = g.City
			if meta, ok := cnRegionMap[strings.ToLower(g.City)]; ok {
				g.RegionISO = meta.ISO
			}
		}
	}
}

func lookupCNRegion(name string) (cnRegionMeta, bool) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" {
		return cnRegionMeta{}, false
	}
	if meta, ok := cnRegionMap[key]; ok {
		return meta, true
	}
	// 去掉常见后缀再试
	for _, suffix := range []string{" province", " sheng", " autonomous region", " municipality"} {
		if strings.HasSuffix(key, suffix) {
			if meta, ok := cnRegionMap[strings.TrimSuffix(key, suffix)]; ok {
				return meta, true
			}
		}
	}
	return cnRegionMeta{}, false
}

func lookupCityZh(name string) (string, bool) {
	key := strings.ToLower(strings.TrimSpace(name))
	if zh, ok := cityZh[key]; ok {
		return zh, true
	}
	return "", false
}

func mapASOrgZh(org string) string {
	l := strings.ToLower(strings.TrimSpace(org))
	if l == "" {
		return org
	}
	for _, rule := range asnOrgKeywordZh {
		if strings.Contains(l, rule.kw) {
			return rule.zh
		}
	}
	// "AS4134 Chinanet" 等形式
	if strings.HasPrefix(l, "as") {
		num := strings.TrimPrefix(l, "as")
		if i := strings.IndexByte(num, ' '); i >= 0 {
			num = num[:i]
		}
		if n, err := strconv.ParseUint(num, 10, 32); err == nil {
			if zh, ok := asnOrgZh[uint(n)]; ok {
				return zh
			}
		}
	}
	return org
}
