document.addEventListener('DOMContentLoaded', () => {

    // --- Date Filter Buttons Toggle ---
    const dateBtns = document.querySelectorAll('.date-btn');
    dateBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            dateBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Re-render chart data if there was a real DB.
            // For now, we simulate a small reload animation on charts.
            updateChartData(e.target.dataset.range);
        });
    });

    // --- Chart.js Global Defaults for Dark Theme ---
    Chart.defaults.color = "rgba(255, 255, 255, 0.5)";
    Chart.defaults.font.family = "'Cairo', sans-serif";
    Chart.defaults.font.size = 13;

    // --- 1. Main Trend Line Chart (Revenue / Expenses / Forecast) ---
    const ctxTrend = document.getElementById('mainTrendChart').getContext('2d');
    
    // Create Gadients for lines
    const gradientRev = ctxTrend.createLinearGradient(0, 0, 0, 400);
    gradientRev.addColorStop(0, 'rgba(16, 185, 129, 0.5)'); // Green fade
    gradientRev.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    const gradientExp = ctxTrend.createLinearGradient(0, 0, 0, 400);
    gradientExp.addColorStop(0, 'rgba(239, 68, 68, 0.4)'); // Red fade
    gradientExp.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    const mainTrendChart = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر'],
            datasets: [
                {
                    label: 'الإيرادات المحققة',
                    data: [65000, 85000, 78000, 105000, 95000, 115000, 130000, 120000, 145000, 150000],
                    borderColor: '#10b981', // Accent Green
                    backgroundColor: gradientRev,
                    borderWidth: 3,
                    tension: 0.4, // Smooth curve
                    fill: true,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 7
                },
                {
                    label: 'المصروفات الفعلية',
                    data: [45000, 50000, 48000, 60000, 58000, 65000, 70000, 68000, 75000, 72000],
                    borderColor: '#ef4444', // Accent Red
                    backgroundColor: gradientExp,
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#ef4444',
                    pointBorderColor: '#fff',
                    pointRadius: 3,
                    pointHoverRadius: 6
                },
                {
                    label: 'التوقعات (Forecast)',
                    data: [60000, 70000, 90000, 95000, 110000, 125000, 135000, 140000, 155000, 160000],
                    borderColor: '#3b82f6', // Accent Blue
                    borderWidth: 2,
                    borderDash: [5, 5], // Dashed line
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: { boxWidth: 12, usePointStyle: true }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 14, family: 'Cairo' },
                    bodyFont: { size: 13, family: 'Cairo' },
                    padding: 12,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    rtl: true
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [4, 4] }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [4, 4] },
                    ticks: { callback: function(value) { return (value/1000) + 'K'; } }
                }
            }
        }
    });

    // --- 2. Category Donut Chart (Revenue Share) ---
    const ctxDonut = document.getElementById('categoryDonutChart').getContext('2d');
    const categoryDonutChart = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: ['مندي وشعبيات', 'وجبات سريعة', 'مشروبات', 'سلطات وحلى'],
            datasets: [{
                data: [55, 25, 12, 8],
                backgroundColor: [
                    '#f59e0b', // Orange
                    '#3b82f6', // Blue
                    '#10b981', // Green
                    '#8b5cf6'  // Purple
                ],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%', // Modern thin donut
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    callbacks: {
                        label: function(context) {
                            return ' ' + context.label + ': ' + context.parsed + '%';
                        }
                    },
                    rtl: true
                }
            }
        }
    });

    // Simulate Chart Update Method on Filter Click
    function updateChartData(range) {
        // Randomly modify data by 10% to simulate fetching new data
        mainTrendChart.data.datasets.forEach(dataset => {
            dataset.data = dataset.data.map(val => val * (0.9 + Math.random() * 0.2));
        });
        mainTrendChart.update();

        categoryDonutChart.data.datasets[0].data = categoryDonutChart.data.datasets[0].data.map(val => val * (0.8 + Math.random() * 0.4));
        categoryDonutChart.update();
    }
});
