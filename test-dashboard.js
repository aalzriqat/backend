// Simple test script to verify dashboard endpoint
const fetch = require('node-fetch');

async function testDashboard() {
  try {
    // First login to get a token
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'alzriqat@company.com',
        password: 'TempPass123!'
      })
    });

    const loginData = await loginResponse.json();
    console.log('Login response:', loginData.success ? 'Success' : 'Failed');

    if (!loginData.success) {
      console.error('Login failed:', loginData.message);
      return;
    }

    const token = loginData.data.token;

    // Test dashboard stats endpoint
    const dashboardResponse = await fetch('http://localhost:3001/api/dashboard/stats', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const dashboardData = await dashboardResponse.json();
    console.log('Dashboard response:', dashboardData);

  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testDashboard();
