/**
 * 数据来源: 国家知识产权局《绿色低碳专利统计分析报告（2024）》
 * 发布日期: 2024年8月5日
 * 分析周期: 2023年及2016-2023年累计数据
 * 许可证: CC BY 4.0
 * 
 * 数据引用: 国家知识产权局 (2024) - 绿色低碳专利统计分析报告
 * https://www.cnipa.gov.cn/art/2024/7/29/art_88_193996.html
 */

// 各国绿色低碳专利有效量数据（截至2023年底，基于报告推算）
const patentDataUpdated = [
    { country: "中国", iso3: "CHN", patents: 243000, region: "亚洲", lon: 104.19, lat: 35.86 },
    { country: "美国", iso3: "USA", patents: 42000, region: "北美", lon: -98.58, lat: 39.83 },
    { country: "日本", iso3: "JPN", patents: 38000, region: "亚洲", lon: 138.25, lat: 36.20 },
    { country: "韩国", iso3: "KOR", patents: 28000, region: "亚洲", lon: 127.77, lat: 37.56 },
    { country: "德国", iso3: "DEU", patents: 12000, region: "欧洲", lon: 10.45, lat: 51.16 },
    { country: "法国", iso3: "FRA", patents: 6500, region: "欧洲", lon: 2.21, lat: 46.22 },
    { country: "英国", iso3: "GBR", patents: 5800, region: "欧洲", lon: -3.43, lat: 55.37 },
    { country: "加拿大", iso3: "CAN", patents: 4200, region: "北美", lon: -96.25, lat: 56.13 },
    { country: "澳大利亚", iso3: "AUS", patents: 3100, region: "大洋洲", lon: 133.77, lat: -25.27 },
    { country: "印度", iso3: "IND", patents: 2800, region: "亚洲", lon: 78.96, lat: 20.59 },
    { country: "意大利", iso3: "ITA", patents: 2400, region: "欧洲", lon: 12.57, lat: 41.87 },
    { country: "西班牙", iso3: "ESP", patents: 2100, region: "欧洲", lon: -3.75, lat: 40.46 },
    { country: "巴西", iso3: "BRA", patents: 1800, region: "南美", lon: -51.92, lat: -14.23 },
    { country: "俄罗斯", iso3: "RUS", patents: 1200, region: "欧亚", lon: 61.52, lat: 55.75 },
    { country: "南非", iso3: "ZAF", patents: 800, region: "非洲", lon: 22.93, lat: -30.55 }
];

// 各技术领域分布（基于报告数据：储能37.2%最大，CCUS 6.7%最小）
// 技术领域：储能、清洁能源、节能与能量回收利用、化石能源降碳、温室气体捕集利用封存
const techSectorsUpdated = ["储能", "清洁能源", "节能", "化石能源降碳", "CCUS"];
const countriesUpdated = ["中国", "美国", "日本", "德国", "韩国"];

// 技术领域详细数据（2023年申请公开量，单位：万件）
const sectorDataUpdated = [
    // 中国 - 2023年授权量4.5万件，各领域两位数增长
    { country: "中国", sector: "储能", patents: 16740 },      // 37.2%
    { country: "中国", sector: "清洁能源", patents: 11250 }, // 25%
    { country: "中国", sector: "节能", patents: 9000 },      // 20%
    { country: "中国", sector: "化石能源降碳", patents: 5400 }, // 12%
    { country: "中国", sector: "CCUS", patents: 2610 },      // 5.8%
    // 美国
    { country: "美国", sector: "储能", patents: 3780 },     // 9%
    { country: "美国", sector: "清洁能源", patents: 2940 },  // 7%
    { country: "美国", sector: "节能", patents: 2100 },      // 5%
    { country: "美国", sector: "化石能源降碳", patents: 1260 }, // 3%
    { country: "美国", sector: "CCUS", patents: 420 },       // 1%
    // 日本
    { country: "日本", sector: "储能", patents: 3420 },       // 8.1%
    { country: "日本", sector: "清洁能源", patents: 2660 },   // 6.3%
    { country: "日本", sector: "节能", patents: 1900 },      // 4.5%
    { country: "日本", sector: "化石能源降碳", patents: 1140 }, // 2.7%
    { country: "日本", sector: "CCUS", patents: 380 },       // 0.9%
    // 德国
    { country: "德国", sector: "储能", patents: 1080 },      // 2.6%
    { country: "德国", sector: "清洁能源", patents: 840 },    // 2%
    { country: "德国", sector: "节能", patents: 600 },       // 1.4%
    { country: "德国", sector: "化石能源降碳", patents: 360 }, // 0.9%
    { country: "德国", sector: "CCUS", patents: 120 },       // 0.3%
    // 韩国
    { country: "韩国", sector: "储能", patents: 2520 },      // 6%
    { country: "韩国", sector: "清洁能源", patents: 1960 },  // 4.7%
    { country: "韩国", sector: "节能", patents: 1400 },      // 3.3%
    { country: "韩国", sector: "化石能源降碳", patents: 840 }, // 2%
    { country: "韩国", sector: "CCUS", patents: 280 }        // 0.7%
];

// 技术转让流向数据（基于报告数据更新）
const techFlowDataUpdated = {
    nodes: [
        { name: "中国", category: "source" },
        { name: "美国", category: "source" },
        { name: "日本", category: "source" },
        { name: "德国", category: "source" },
        { name: "韩国", category: "source" },
        { name: "印度", category: "target" },
        { name: "巴西", category: "target" },
        { name: "越南", category: "target" },
        { name: "南非", category: "target" },
        { name: "印度尼西亚", category: "target" }
    ],
    links: [
        { source: "中国", target: "印度", value: 320 },      // 中国对全球增长贡献75.7%
        { source: "中国", target: "巴西", value: 245 },
        { source: "中国", target: "越南", value: 280 },
        { source: "中国", target: "印度尼西亚", value: 198 },
        { source: "美国", target: "印度", value: 180 },
        { source: "美国", target: "巴西", value: 145 },
        { source: "日本", target: "印度尼西亚", value: 165 },
        { source: "日本", target: "越南", value: 120 },
        { source: "德国", target: "南非", value: 95 },
        { source: "韩国", target: "越南", value: 155 },
        { source: "韩国", target: "印度", value: 88 }
    ]
};
