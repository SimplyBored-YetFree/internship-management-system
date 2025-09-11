function renderPieChart(taskData) {
    const ctx = document.getElementById('taskPieChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(taskData),
            datasets: [{
                data: Object.values(taskData),
                backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff']
            }]
        }
    });
}