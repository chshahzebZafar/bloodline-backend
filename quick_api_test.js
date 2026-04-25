// Quick API Test Script for BloodLink
// Run with: node quick_api_test.js

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

// Test functions
async function testHealth() {
    console.log('🏥 Testing Health Check...');
    try {
        const response = await fetch(`${BASE_URL}/health`);
        const data = await response.json();
        console.log('✅ Health Check:', response.status, data);
        return true;
    } catch (error) {
        console.log('❌ Health Check Failed:', error.message);
        return false;
    }
}

async function testRegistration() {
    console.log('👤 Testing User Registration...');
    try {
        const response = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@bloodlink.com',
                password: 'testpassword123',
                name: 'Test Donor',
                phone: '+1234567890',
                bloodType: 'O+',
                countryCode: 'PK',
                city: 'Karachi'
            })
        });
        const data = await response.json();
        console.log('✅ Registration:', response.status, data);
        return data.token || null;
    } catch (error) {
        console.log('❌ Registration Failed:', error.message);
        return null;
    }
}

async function testLogin() {
    console.log('🔐 Testing Login...');
    try {
        const response = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@bloodlink.com',
                password: 'testpassword123'
            })
        });
        const data = await response.json();
        console.log('✅ Login:', response.status, data);
        return data.token || null;
    } catch (error) {
        console.log('❌ Login Failed:', error.message);
        return null;
    }
}

async function testProfile(token) {
    console.log('👤 Testing User Profile...');
    try {
        const response = await fetch(`${BASE_URL}/users/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        console.log('✅ Profile:', response.status, data);
        return data;
    } catch (error) {
        console.log('❌ Profile Failed:', error.message);
        return null;
    }
}

async function runTests() {
    console.log('🩸 Starting BloodLink API Tests...\n');
    
    // Test health check
    const healthOk = await testHealth();
    if (!healthOk) {
        console.log('❌ Server not responding - make sure API is running on port 3000');
        return;
    }
    
    console.log('\n');
    
    // Test registration
    const regToken = await testRegistration();
    
    console.log('\n');
    
    // Test login
    const loginToken = await testLogin();
    
    console.log('\n');
    
    // Test profile (if we have a token)
    const token = loginToken || regToken;
    if (token) {
        await testProfile(token);
    } else {
        console.log('❌ No authentication token available for profile test');
    }
    
    console.log('\n🩸 API Tests Complete!');
    console.log('\n📊 Now run analyze_api_results.sql in Supabase to see database results');
}

// Run tests
runTests().catch(console.error);
