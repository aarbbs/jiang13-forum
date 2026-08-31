package service

import "testing"

func TestApplyGeoZh_Huainan(t *testing.T) {
	g := &GeoInfo{Country: "CN", Region: "Anhui", City: "Huainan", ASN: 4134, ASOrg: "Chinanet"}
	ApplyGeoZh(g)
	if g.Region != "安徽" || g.RegionISO != "AH" {
		t.Fatalf("region=%q iso=%q", g.Region, g.RegionISO)
	}
	if g.City != "淮南" {
		t.Fatalf("city=%q want 淮南", g.City)
	}
	if g.ASOrg != "中国电信" {
		t.Fatalf("as_org=%q", g.ASOrg)
	}
}

func TestApplyGeoZh_AmbiguousSuzhou(t *testing.T) {
	js := &GeoInfo{Country: "CN", Region: "Jiangsu", City: "Suzhou"}
	ApplyGeoZh(js)
	if js.City != "苏州" {
		t.Fatalf("jiangsu suzhou=%q", js.City)
	}
	ah := &GeoInfo{Country: "CN", Region: "Anhui", City: "Suzhou"}
	ApplyGeoZh(ah)
	if ah.City != "宿州" {
		t.Fatalf("anhui suzhou=%q", ah.City)
	}
}

func TestApplyGeoZh_AmbiguousTaizhouFuzhouYichunYulin(t *testing.T) {
	cases := []struct {
		region, city, want string
	}{
		{"Jiangsu", "Taizhou", "泰州"},
		{"Zhejiang", "Taizhou", "台州"},
		{"Fujian", "Fuzhou", "福州"},
		{"Jiangxi", "Fuzhou", "抚州"},
		{"Heilongjiang", "Yichun", "伊春"},
		{"Jiangxi", "Yichun", "宜春"},
		{"Guangxi Zhuangzu", "Yulin", "玉林"},
		{"Shaanxi", "Yulin", "榆林"},
		{"Gansu", "Longnan", "陇南"},
		{"Jiangxi", "Longnan", "龙南"},
		{"Shanxi", "Jincheng", "晋城"},
		{"Kinmen", "Jincheng", "金城"},
	}
	for _, c := range cases {
		g := &GeoInfo{Country: "CN", Region: c.region, City: c.city}
		if c.region == "Kinmen" {
			g.Country = "TW"
		}
		ApplyGeoZh(g)
		if g.City != c.want {
			t.Fatalf("%s %s → %q want %q", c.region, c.city, g.City, c.want)
		}
	}
}

func TestApplyGeoZh_Aliases(t *testing.T) {
	for _, city := range []string{"Xi'an", "Xian", "xi'an"} {
		g := &GeoInfo{Country: "CN", Region: "Shaanxi", City: city}
		ApplyGeoZh(g)
		if g.City != "西安" {
			t.Fatalf("%q → %q", city, g.City)
		}
	}
	g := &GeoInfo{Country: "CN", Region: "Jiangsu", City: "Huai'an"}
	ApplyGeoZh(g)
	if g.City != "淮安" {
		t.Fatalf("Huai'an → %q", g.City)
	}
}

func TestApplyGeoZh_NonCNUnchanged(t *testing.T) {
	g := &GeoInfo{Country: "US", Region: "California", City: "San Francisco"}
	ApplyGeoZh(g)
	if g.City != "San Francisco" || g.Region != "California" {
		t.Fatalf("got region=%q city=%q", g.Region, g.City)
	}
}

func TestApplyGeoZh_RegionAliases(t *testing.T) {
	g := &GeoInfo{Country: "CN", Region: "Guangxi Zhuangzu", City: "Nanning"}
	ApplyGeoZh(g)
	if g.Region != "广西" || g.RegionISO != "GX" || g.City != "南宁" {
		t.Fatalf("got %+v", g)
	}
	g2 := &GeoInfo{Country: "CN", Region: "Xinjiang Uygur", City: "Kashgar"}
	ApplyGeoZh(g2)
	if g2.Region != "新疆" || g2.City != "喀什" {
		t.Fatalf("got %+v", g2)
	}
}

func TestApplyGeoZh_CitySuffix(t *testing.T) {
	g := &GeoInfo{Country: "CN", Region: "Anhui", City: "Huainan City"}
	ApplyGeoZh(g)
	if g.City != "淮南" {
		t.Fatalf("city=%q", g.City)
	}
}

func TestLookupCityZh_FallbackWithoutRegion(t *testing.T) {
	zh, ok := lookupCityZh("", "", "Suzhou")
	if !ok || zh != "苏州" {
		t.Fatalf("fallback suzhou=%q ok=%v", zh, ok)
	}
}

func TestApplyGeoZh_LiteCNCitiesCoverage(t *testing.T) {
	var missing []string
	for _, row := range liteCNCities {
		country := "CN"
		rk := row.region
		switch rk {
		case "Hong Kong":
			country = "HK"
		case "Macao":
			country = "MO"
		case "Changhua", "Chiayi", "Hsinchu", "Hualien", "Kaohsiung", "Keelung",
			"Kinmen", "Lienchiang", "Miaoli", "Nantou", "New Taipei", "Penghu",
			"Pingtung", "Taichung", "Tainan", "Taipei", "Taitung", "Taoyuan",
			"Yilan", "Yunlin":
			country = "TW"
		}
		g := &GeoInfo{Country: country, Region: row.region, City: row.city}
		ApplyGeoZh(g)
		if g.City == "" || g.City == row.city {
			// 仍为英文原文则未映射（中文不应等于英文，除非本身就是纯 ASCII 且已是目标——LITE 全是拼音）
			if g.City == row.city {
				missing = append(missing, row.region+"/"+row.city+"→"+g.City)
			}
		}
	}
	if len(missing) > 0 {
		t.Fatalf("未中文化 %d 条，示例: %v", len(missing), missing[:min(20, len(missing))])
	}
}
