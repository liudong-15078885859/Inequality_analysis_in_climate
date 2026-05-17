// 页面逻辑，从 test.html 提取
(async function () {
    // ============ DOM 引用 ============
    const chartEl = document.getElementById('chart');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const toggleGroup = document.getElementById('toggleGroup');
    const btnTotal = document.getElementById('btnTotal');
    const btnPerCapita = document.getElementById('btnPerCapita');
    const btnCumulative = document.getElementById('btnCumulative');
    const selectWrap = document.getElementById('selectWrap');
    const searchInput = document.getElementById('searchInput');
    const selectedTags = document.getElementById('selectedTags');
    const dropdownPanel = document.getElementById('dropdownPanel');
    const dropdownList = document.getElementById('dropdownList');
    const btnSelectAll = document.getElementById('btnSelectAll');
    const btnClearAll = document.getElementById('btnClearAll');
    const btnReset = document.getElementById('btnReset');
    const mainContainer = document.getElementById('mainContainer');

    // ============ 状态 ============
    let currentMode = 'total'; // 'total' | 'percapita' | 'cumulative'
    const DEFAULT_SELECTION = ['China', 'United States', 'World', 'United Kingdom', 'India'];
    let selectedCountries = new Set(DEFAULT_SELECTION);
    let allCountryNames = [];
    let countryDataCache = {}; // { countryName: { years: [], values: [] } }
    let dataLoaded = { total: false, percapita: false, cumulative: false };
    let csvCache = { total: null, percapita: null, cumulative: null };

    // 颜色预设
    const presetColors = {
        'China': '#EF4444',
        'United States': '#2563EB',
        'World': '#374151',
        'United Kingdom': '#0891B2',
        'India': '#F97316',
        'Russia': '#7C3AED',
        'Japan': '#10B981',
        'Canada': '#F59E0B',
        'Germany': '#8B5CF6',
        'Brazil': '#EC4899',
        'Indonesia': '#06B6D4',
        'France': '#6366F1',
        'Australia': '#14B8A6',
        'South Korea': '#F43F5E',
        'Mexico': '#84CC16',
    };
    const defaultColorPalette = [
        '#e41a1c', // red
        '#377eb8', // blue
        '#4daf4a', // green
        '#984ea3', // purple
        '#ff7f00', // orange
        '#ffff33', // yellow
        '#a65628', // brown
        '#f781bf', // pink
        '#999999', // gray
        '#66c2a5', // teal
        '#fc8d62', // salmon
        '#8da0cb', // light blue
        '#e78ac3', // light pink
        '#a6d854', // light green
        '#ffd92f', // gold
        '#e5c494', // tan
        '#1b9e77', // teal-green
        '#d95f02', // rust
        '#7570b3', // indigo
        '#b3b3b3', // light gray
    ];

    function getColorForCountry(name, index) {
        if (presetColors[name]) return presetColors[name];
        return defaultColorPalette[index % defaultColorPalette.length];
    }

    // ============ CSV 解析 ============
    function parseCSV(text, valueColumnName) {
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) return {};
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const entityIdx = headers.indexOf('Entity');
        const yearIdx = headers.indexOf('Year');
        const valueIdx = headers.indexOf(valueColumnName);
        if (entityIdx === -1 || yearIdx === -1 || valueIdx === -1) {
            // 尝试模糊匹配
            let foundValueIdx = -1;
            for (let i = 0; i < headers.length; i++) {
                if (headers[i].includes(valueColumnName) || headers[i].includes('CO₂') || headers[i]
                    .includes('CO2')) {
                    foundValueIdx = i;
                    break;
                }
            }
            if (foundValueIdx === -1) {
                console.error('CSV 列名不匹配，可用列:', headers);
                return {};
            }
            return parseCSVWithIndices(text, entityIdx, yearIdx, foundValueIdx);
        }
        return parseCSVWithIndices(text, entityIdx, yearIdx, valueIdx);
    }

    function parseCSVWithIndices(text, entityIdx, yearIdx, valueIdx) {
        const lines = text.trim().split(/\r?\n/);
        const result = {};
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = parseCSVLine(line);
            if (cols.length <= Math.max(entityIdx, yearIdx, valueIdx)) continue;
            const entity = cols[entityIdx]?.trim().replace(/^"|"$/g, '');
            const year = parseInt(cols[yearIdx], 10);
            const value = parseFloat(cols[valueIdx]);
            if (!entity || isNaN(year) || isNaN(value)) continue;
            if (!result[entity]) {
                result[entity] = { years: [], values: [] };
            }
            result[entity].years.push(year);
            result[entity].values.push(value);
        }
        // 排序
        for (const entity in result) {
            const data = result[entity];
            const combined = data.years.map((y, idx) => [y, data.values[idx]]).sort((a, b) => a[0] - b[0]);
            data.years = combined.map(c => c[0]);
            data.values = combined.map(c => c[1]);
        }
        return result;
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current);
        return result;
    }

    // ============ 数据加载 ============
    async function loadDataset(mode) {
        if (dataLoaded[mode]) return csvCache[mode];
        const filename = mode === 'total' ? 'annual-co2-emissions.csv' : (mode === 'percapita' ? 'co2-emissions-per-capita.csv' : 'cumulative-co2-emissions.csv');
        const valueCol = mode === 'total' ? 'Annual CO₂ emissions' : (mode === 'percapita' ? 'CO₂ emissions per capita' : 'Cumulative CO₂ emissions');
        showLoading(`正在加载 ${mode === 'total' ? '总排放量' : (mode === 'percapita' ? '人均排放量' : '累计排放量')} 数据...`);
        try {
            const resp = await fetch(filename);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const text = await resp.text();
            const data = parseCSV(text, valueCol);
            if (Object.keys(data).length === 0) throw new Error('数据解析为空');
            csvCache[mode] = data;
            dataLoaded[mode] = true;
            updateAllCountryNames();
            hideLoading();
            return data;
        } catch (err) {
            console.error('数据加载失败:', err);
            hideLoading();
            throw err;
        }
    }

    function updateAllCountryNames() {
        const allNames = new Set();
        if (csvCache.total) Object.keys(csvCache.total).forEach(n => allNames.add(n));
        if (csvCache.percapita) Object.keys(csvCache.percapita).forEach(n => allNames.add(n));
        if (csvCache.cumulative) Object.keys(csvCache.cumulative).forEach(n => allNames.add(n));
        allCountryNames = Array.from(allNames).sort((a, b) => a.localeCompare(b));
        // 确保默认选择的国家在列表中
        for (const name of DEFAULT_SELECTION) {
            if (!allNames.has(name)) {
                allNames.add(name);
            }
        }
        allCountryNames = Array.from(allNames).sort((a, b) => a.localeCompare(b));
        renderDropdownList();
        renderTags();
    }

    function getCurrentData() {
        return csvCache[currentMode] || {};
    }

    // ============ UI 函数 ============
    function showLoading(msg) {
        loadingText.textContent = msg || '加载中...';
        loadingOverlay.classList.add('visible');
    }

    function hideLoading() {
        loadingOverlay.classList.remove('visible');
    }

    function renderTags() {
        selectedTags.innerHTML = '';
        const sorted = Array.from(selectedCountries).sort((a, b) => a.localeCompare(b));
        for (const name of sorted) {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.innerHTML = `${name} <span class="remove-tag" data-country="${name}">&times;</span>`;
            selectedTags.appendChild(tag);
        }
        // 绑定移除事件
        selectedTags.querySelectorAll('.remove-tag').forEach(span => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = span.getAttribute('data-country');
                selectedCountries.delete(name);
                renderTags();
                renderDropdownList();
                updateChart();
            });
        });
    }

    function renderDropdownList(filterText = '') {
        dropdownList.innerHTML = '';
        const filter = filterText.toLowerCase().trim();
        let filtered = allCountryNames;
        if (filter) {
            filtered = allCountryNames.filter(n => n.toLowerCase().includes(filter));
        }
        if (filtered.length === 0) {
            dropdownList.innerHTML =
                '<div class="no-results">未找到匹配的国家/地区</div>';
        } else {
            for (const name of filtered) {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selectedCountries.has(name);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        selectedCountries.add(name);
                    } else {
                        selectedCountries.delete(name);
                    }
                    renderTags();
                    updateChart();
                });
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(name));
                dropdownList.appendChild(label);
            }
        }
    }

    function toggleDropdown(forceOpen) {
        const isOpen = dropdownPanel.classList.contains('open');
        if (forceOpen === true || (forceOpen === undefined && !isOpen)) {
            dropdownPanel.classList.add('open');
            selectWrap.classList.add('active');
            renderDropdownList(searchInput.value);
            searchInput.focus();
        } else {
            dropdownPanel.classList.remove('open');
            selectWrap.classList.remove('active');
        }
    }

    // ============ 图表更新 ============
    function updateChart() {
        const data = getCurrentData();
        if (Object.keys(data).length === 0) {
            Plotly.react(chartEl, [], getLayout(), getConfig());
            return;
        }

        const sortedSelection = Array.from(selectedCountries).sort((a, b) => a.localeCompare(b));
        const traces = [];
        let colorIndex = 0;

        for (const name of sortedSelection) {
            const countryData = data[name];
            if (!countryData || countryData.years.length === 0) continue;
            traces.push({
                x: countryData.years,
                y: countryData.values,
                name: name,
                type: 'scatter',
                mode: 'lines',
                line: {
                    color: getColorForCountry(name, colorIndex),
                    width: name === 'World' ? 3.2 : 2.4,
                    dash: name === 'World' ? 'dash' : 'solid',
                    shape: 'spline',
                    smoothing: 0.5,
                },
                hovertemplate: '<b>%{fullData.name}</b><br>' +
                    '年份: <b>%{x}</b><br>' +
                    (currentMode === 'total' ?
                        '排放量: <b>%{y:,.0f}</b> 吨' : (currentMode === 'percapita' ?
                        '人均排放: <b>%{y:.3f}</b> 吨/人' :
                        '累计排放量: <b>%{y:,.0f}</b> 吨')) +
                    '<extra></extra>',
                hoverlabel: {
                    bgcolor: getColorForCountry(name, colorIndex),
                    font: { color: '#fff', size: 13, family: 'Inter, Segoe UI, sans-serif' },
                    bordercolor: getColorForCountry(name, colorIndex),
                },
                connectgaps: false,
            });
            colorIndex++;
        }

        Plotly.react(chartEl, traces, getLayout(), getConfig());
    }

    function getLayout() {
        return {
            margin: { l: 60, r: 30, t: 10, b: 80, pad: 8 },
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
            font: {
                family: 'Inter, Segoe UI, Helvetica Neue, PingFang SC, Microsoft YaHei, sans-serif',
                color: '#374151',
                size: 13,
            },
            xaxis: {
                tickfont: { size: 12, color: '#6B7280' },
                gridcolor: '#f1f3f5',
                gridwidth: 0.8,
                zeroline: false,
                showline: true,
                linecolor: '#d1d5db',
                linewidth: 1,
                dtick: 25,
                rangeselector: {
                    visible: true,
                    x: 0.01,
                    y: 1.08,
                    buttons: [
                        { count: null, label: '全部', step: 'all', stepmode: 'backward' },
                        { count: 125, label: '1900–2024', step: 'year', stepmode: 'backward' },
                        { count: 75, label: '1950–2024', step: 'year', stepmode: 'backward' },
                        { count: 25, label: '2000–2024', step: 'year', stepmode: 'backward' },
                    ],
                    bgcolor: '#ffffff',
                    activecolor: '#2563EB',
                    bordercolor: '#d1d5db',
                    borderwidth: 1,
                    font: { size: 11, color: '#374151', family: 'Inter, sans-serif' },
                },
                rangeslider: {
                    visible: true,
                    thickness: 0.07,
                    bgcolor: '#f9fafb',
                    bordercolor: '#e5e7eb',
                    borderwidth: 1,
                },
            },
            yaxis: {
                title: {
                    text: currentMode === 'total' ? '吨 (tonnes)' : '吨/人 (tonnes/person)',
                    font: { size: 12, color: '#6B7280' },
                    standoff: 6,
                },
                tickfont: { size: 12, color: '#6B7280' },
                gridcolor: '#f1f3f5',
                gridwidth: 0.8,
                zeroline: true,
                zerolinecolor: '#d1d5db',
                zerolinewidth: 1,
                showline: true,
                linecolor: '#d1d5db',
                linewidth: 1,
                rangemode: 'nonnegative',
            },
            legend: {
                orientation: 'h',
                x: 0.5,
                y: -0.32,
                xanchor: 'center',
                bgcolor: 'rgba(255,255,255,0.9)',
                bordercolor: '#e5e7eb',
                borderwidth: 1,
                font: { size: 12, color: '#374151' },
                itemwidth: 30,
            },
            hovermode: 'x unified',
        };
    }

    function getConfig() {
        return {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: [
                'lasso2d', 'select2d', 'sendDataToCloud',
                'autoScale2d', 'toggleSpikelines',
                'hoverClosestCartesian', 'hoverCompareCartesian',
            ],
            scrollZoom: true,
            doubleClick: 'reset+autosize',
        };
    }

    // ============ 模式切换 ============
    async function switchMode(mode) {
        if (currentMode === mode && dataLoaded[mode]) return;
        currentMode = mode;
        btnTotal.classList.toggle('active', mode === 'total');
        btnPerCapita.classList.toggle('active', mode === 'percapita');
        btnCumulative.classList.toggle('active', mode === 'cumulative');
        try {
            await loadDataset(mode);
            updateAllCountryNames();
            updateChart();
        } catch (err) {
            alert(`数据加载失败: ${err.message}\n请确保 CSV 文件与本页面在同一目录下，并通过 HTTP 服务器访问。`);
        }
    }

    // ============ 事件绑定 ============
    btnTotal.addEventListener('click', () => switchMode('total'));
    btnPerCapita.addEventListener('click', () => switchMode('percapita'));
    btnCumulative.addEventListener('click', () => switchMode('cumulative'));

    selectWrap.addEventListener('click', (e) => {
        if (e.target === searchInput) return;
        toggleDropdown();
    });

    searchInput.addEventListener('input', () => {
        renderDropdownList(searchInput.value);
        if (!dropdownPanel.classList.contains('open')) {
            toggleDropdown(true);
        }
    });

    searchInput.addEventListener('focus', () => {
        if (!dropdownPanel.classList.contains('open')) {
            toggleDropdown(true);
        }
    });

    btnSelectAll.addEventListener('click', () => {
        const filter = searchInput.value.toLowerCase().trim();
        const filtered = filter ?
            allCountryNames.filter(n => n.toLowerCase().includes(filter)) :
            allCountryNames;
        for (const name of filtered) {
            selectedCountries.add(name);
        }
        renderTags();
        renderDropdownList(searchInput.value);
        updateChart();
    });

    btnClearAll.addEventListener('click', () => {
        selectedCountries.clear();
        renderTags();
        renderDropdownList(searchInput.value);
        updateChart();
    });

    btnReset.addEventListener('click', () => {
        selectedCountries = new Set(DEFAULT_SELECTION);
        renderTags();
        renderDropdownList(searchInput.value);
        updateChart();
    });

    // 点击外部关闭下拉
    document.addEventListener('click', (e) => {
        const selector = document.getElementById('countrySelector');
        if (!selector.contains(e.target)) {
            dropdownPanel.classList.remove('open');
            selectWrap.classList.remove('active');
        }
    });

    // 窗口大小变化
    window.addEventListener('resize', () => {
        if (chartEl && chartEl._fullLayout) {
            Plotly.Plots.resize(chartEl);
        }
    });

    // ============ 初始化 ============
    async function init() {
        showLoading('正在加载数据...');
        try {
            await loadDataset('total');
            // 预加载人均数据
            loadDataset('percapita').catch(() => { });
            // 预加载累计数据
            loadDataset('cumulative').catch(() => { });
            updateAllCountryNames();
            // 设置默认选择
            selectedCountries = new Set(DEFAULT_SELECTION);
            renderTags();
            renderDropdownList();
            updateChart();
            hideLoading();
        } catch (err) {
            hideLoading();
            chartEl.innerHTML = `<div style="color:#DC2626;padding:40px;text-align:center;font-family:inherit;">
                <p style="font-size:16px;">⚠️ 无法加载数据文件</p>
                <p style="font-size:13px;color:#6B7280;margin-top:8px;">
                请确保 <code>annual-co2-emissions.csv</code> 和 <code>co2-emissions-per-capita.csv</code><br>
                与本 HTML 在同一目录下，并通过 HTTP 服务器打开（避免 <code>file://</code> 协议限制）。
                </p>
            </div>`;
        }
    }

    init();

    console.log('%c🌍 CO₂ 排放量交互式图表已就绪 %c| %c切换总排放/人均/累计 %c| %c多选国家 %c| %c1750–2024',
        'color:#2563EB;font-weight:bold;',
        '', 'color:#374151;', '', 'color:#374151;', '', 'color:#6B7280;');
})();
