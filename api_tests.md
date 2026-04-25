# BloodLink API Tests

## Base URL
```
http://localhost:3000
```

## Test Endpoints

### 1. Health Check
```bash
curl -X GET http://localhost:3000/health
```

### 2. Create Test User (Registration)
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@bloodlink.com",
    "password": "testpassword123",
    "name": "Test Donor",
    "phone": "+1234567890",
    "bloodType": "O+",
    "countryCode": "PK",
    "city": "Karachi"
  }'
```

### 3. Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@bloodlink.com",
    "password": "testpassword123"
  }'
```

### 4. Create Blood Request
```bash
curl -X POST http://localhost:3000/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "bloodType": "O+",
    "component": "whole",
    "unitsNeeded": 2,
    "hospitalName": "Test Hospital",
    "hospitalLocation": {
      "lng": 67.0011,
      "lat": 24.8607
    },
    "urgency": "normal",
    "expiresAt": "2024-04-30T23:59:59Z",
    "notes": "Urgent need for O+ blood"
  }'
```

### 5. Find Nearby Donors
```bash
curl -X GET "http://localhost:3000/donors/nearby?lng=67.0011&lat=24.8607&radius=50000&bloodTypes=O+,A+" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6. Find Nearby Hospitals
```bash
curl -X GET "http://localhost:3000/hospitals/nearby?lng=67.0011&lat=24.8607&radius=50000" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 7. Get User Profile
```bash
curl -X GET http://localhost:3000/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 8. Update User Location
```bash
curl -X PATCH http://localhost:3000/users/location \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "location": {
      "lng": 67.0011,
      "lat": 24.8607
    }
  }'
```

### 9. Accept Blood Request
```bash
curl -X POST http://localhost:3000/requests/REQUEST_ID/accept \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 10. Create Donation Record
```bash
curl -X POST http://localhost:3000/donations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "requestId": "REQUEST_ID",
    "hospitalName": "Test Hospital",
    "donationDate": "2024-04-25",
    "bloodType": "O+",
    "component": "whole",
    "units": 1
  }'
```

## Expected Responses

- **200**: Success
- **201**: Created
- **400**: Bad Request
- **401**: Unauthorized
- **404**: Not Found
- **500**: Server Error

## Notes
- Replace `YOUR_JWT_TOKEN` with actual token from login response
- Replace `REQUEST_ID` with actual request ID from create request response
- Test in order: Register → Login → Create Request → Find Donors → Accept → Create Donation
