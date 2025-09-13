function renderPieChart(evaluationData) {
    const ctx = document.getElementById('evaluationPieChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [
                'Technical Skill',
                'Initiative',
                'Communication',
                'Professionalism',
                'Timely Completion'
            ],
            datasets: [{
                data: [
                    evaluationData.technical_skill,
                    evaluationData.initiative,
                    evaluationData.communication,
                    evaluationData.professionalism,
                    evaluationData.timely_completion
                ],
                backgroundColor: [
                    '#ff6384', // Red
                    '#36a2eb', // Blue
                    '#ffce56', // Yellow
                    '#4bc0c0', // Cyan
                    '#9966ff'  // Purple
                ],
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: {
                            size: 14,
                            family: 'Inter, sans-serif'
                        },
                        color: '#0f172a'
                    }
                },
                title: {
                    display: true,
                    text: 'Evaluation Metrics',
                    font: {
                        size: 18,
                        family: 'Inter, sans-serif',
                        weight: 'bold'
                    },
                    color: '#0f172a'
                }
            }
        }
    });
}