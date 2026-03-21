// Update Date and Time continuously
function updateDateTime() {
    const timeDisplay = document.getElementById('datetime-display');
    const now = new Date();
    
    // Arabic formatted date
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('ar-SA', options);
    
    // Arabic formatted time
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    
    timeDisplay.innerHTML = `${dateStr} - ${timeStr}`;
}

setInterval(updateDateTime, 1000);
updateDateTime();

// Setup Sales Chart with Chart.js
document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('salesChart').getContext('2d');
    
    // Create elegant gradient for line chart
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // Blue accent
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    
    const data = {
        labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
        datasets: [{
            label: 'المبيعات (ر.س)',
            data: [3200, 2800, 3500, 4100, 3800, 5200, 6500],
            backgroundColor: gradient,
            borderColor: '#3b82f6', // Accent blue
            borderWidth: 3,
            pointBackgroundColor: '#0f172a',
            pointBorderColor: '#3b82f6',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: true,
            tension: 0.4 // Smooth curves
        }]
    };

    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Hide default legend for cleaner look
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Cairo', size: 14 },
                    bodyFont: { family: 'Cairo', size: 14 },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + ' ر.س';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Cairo', size: 12 }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Cairo', size: 12 },
                        callback: function(value) {
                            return value + ' ر.س';
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        }
    };

    new Chart(ctx, config);
    
    // Generic UI Interactions
    const navItems = document.querySelectorAll('.nav-item');
    /* 
    We removed the e.preventDefault() from here to allow real navigation 
    between our newly created html pages. 
    */
});
