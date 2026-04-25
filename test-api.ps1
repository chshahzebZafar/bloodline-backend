# BloodLink API smoke test — PowerShell
# Usage: powershell -ExecutionPolicy Bypass -File .\test-api.ps1

$ErrorActionPreference = 'Continue'
$Api = 'http://localhost:3000/v1'
$Pass = 0
$Fail = 0
$Stamp = [int][double]::Parse((Get-Date -UFormat %s))

function Test-Endpoint {
  param(
    [string]$Name,
    [scriptblock]$Block,
    [int[]]$Expect = @(200, 201)
  )
  Write-Host ""
  Write-Host ("━━━ {0} ━━━" -f $Name) -ForegroundColor Cyan
  try {
    $r = & $Block
    $code = $r.StatusCode
    if ($Expect -contains $code) {
      Write-Host ("[PASS] {0}" -f $code) -ForegroundColor Green
      $script:Pass++
    } else {
      Write-Host ("[FAIL] expected {0}, got {1}" -f ($Expect -join '/'), $code) -ForegroundColor Red
      $script:Fail++
    }
    if ($r.Content.Length -lt 300) { Write-Host $r.Content -ForegroundColor Gray }
    else { Write-Host ($r.Content.Substring(0, 300) + '…') -ForegroundColor Gray }
    return $r
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $body = $sr.ReadToEnd()
      $code = [int]$resp.StatusCode
      if ($Expect -contains $code) {
        Write-Host ("[PASS] {0} (expected)" -f $code) -ForegroundColor Green
        $script:Pass++
      } else {
        Write-Host ("[FAIL] {0}" -f $code) -ForegroundColor Red
        $script:Fail++
      }
      Write-Host $body -ForegroundColor Gray
      return @{ StatusCode = $code; Content = $body }
    }
    Write-Host ("[ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
    $script:Fail++
    return $null
  }
}

function Invoke-Api {
  param([string]$Method, [string]$Path, [hashtable]$Headers = @{}, [object]$Body = $null)
  $uri = "$Api$Path"
  $p = @{ Method = $Method; Uri = $uri; Headers = $Headers; UseBasicParsing = $true }
  if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 8 -Compress); $p.ContentType = 'application/json' }
  Invoke-WebRequest @p
}

# ─── HEALTH ─────────────────────────────────────────────────────────────────
Test-Endpoint '/health' { Invoke-WebRequest "$Api/../health" -UseBasicParsing }

# ─── AUTH ────────────────────────────────────────────────────────────────────
$email = "pstest$Stamp@bloodlink.test"
$regBody = @{
  email = $email; password = 'Pass1234!'; name = 'PS Test'; blood_type = 'O+'
  lat = 24.8607; lng = 67.0011; country_code = 'PK'; city = 'Karachi'
}
$r = Test-Endpoint 'POST /auth/register' { Invoke-Api POST '/auth/register' -Body $regBody } -Expect @(201)

$loginBody = @{ email = $email; password = 'Pass1234!' }
$r = Test-Endpoint 'POST /auth/login' { Invoke-Api POST '/auth/login' -Body $loginBody } -Expect @(200)

# Extract tokens from login response
$session = ($r.Content | ConvertFrom-Json).data
$token = $session.access_token
$refresh = $session.refresh_token
$userId = $session.user.id
$headers = @{ Authorization = "Bearer $token" }
Write-Host ""
Write-Host ("token len = {0}, userId = {1}" -f $token.Length, $userId) -ForegroundColor Yellow

Test-Endpoint 'POST /auth/refresh' { Invoke-Api POST '/auth/refresh' -Body @{ refresh_token = $refresh } } -Expect @(200)
Test-Endpoint 'POST /auth/otp/send (expect 400 — no SMS provider)' { Invoke-Api POST '/auth/otp/send' -Body @{ phone = '+923001234567' } } -Expect @(400)
Test-Endpoint 'POST /auth/otp/verify (expect 401 — invalid)' { Invoke-Api POST '/auth/otp/verify' -Body @{ phone = '+923001234567'; token = '123456' } } -Expect @(401)

# ─── USERS ──────────────────────────────────────────────────────────────────
Test-Endpoint 'GET /users/me' { Invoke-Api GET '/users/me' -Headers $headers }
Test-Endpoint 'PUT /users/me' { Invoke-Api PUT '/users/me' -Headers $headers -Body @{ name = 'PS Test Updated' } }
Test-Endpoint 'PUT /users/me/location' { Invoke-Api PUT '/users/me/location' -Headers $headers -Body @{ lat = 24.8607; lng = 67.0011; country_code = 'PK'; city = 'Karachi' } }
Test-Endpoint 'PUT /users/me/availability' { Invoke-Api PUT '/users/me/availability' -Headers $headers -Body @{ availability = 'available' } }
Test-Endpoint 'PUT /users/me/fcm-token' { Invoke-Api PUT '/users/me/fcm-token' -Headers $headers -Body @{ fcm_token = 'fcm_test_token_abcdef' } }
Test-Endpoint 'POST /users/me/eligibility' {
  Invoke-Api POST '/users/me/eligibility' -Headers $headers -Body @{
    answers = @{
      recent_illness = $false; recent_travel_malaria = $false; current_medications = ''
      tattoo_or_piercing_recent = $false; pregnant_or_postpartum = $false; recent_surgery = $false
    }
  }
}
Test-Endpoint 'GET /users/:id' { Invoke-Api GET "/users/$userId" -Headers $headers }
Test-Endpoint 'GET /users/me/passport (PDF)' { Invoke-Api GET '/users/me/passport' -Headers $headers }

# ─── REQUESTS ───────────────────────────────────────────────────────────────
$reqBody = @{
  blood_type = 'A+'; component = 'whole'; units_needed = 2; hospital_name = 'Test Hospital'
  hospital_lat = 24.8946; hospital_lng = 67.0626; urgency = 'urgent'; expires_in_hours = 12
}
$r = Test-Endpoint 'POST /requests' { Invoke-Api POST '/requests' -Headers $headers -Body $reqBody } -Expect @(201)
$reqId = ($r.Content | ConvertFrom-Json).data.id
Write-Host ("reqId = {0}" -f $reqId) -ForegroundColor Yellow

Test-Endpoint 'GET /requests/nearby' { Invoke-Api GET '/requests/nearby?lat=24.8946&lng=67.0626&radius_km=50' -Headers $headers }
Test-Endpoint 'GET /requests/mine' { Invoke-Api GET '/requests/mine' -Headers $headers }
Test-Endpoint 'GET /requests/:id' { Invoke-Api GET "/requests/$reqId" -Headers $headers }
Test-Endpoint 'PUT /requests/:id' { Invoke-Api PUT "/requests/$reqId" -Headers $headers -Body @{ urgency = 'critical'; notes = 'Updated via PS test' } }
Test-Endpoint 'POST /requests/:id/accept (own — expect 400)' { Invoke-Api POST "/requests/$reqId/accept" -Headers $headers } -Expect @(400)
Test-Endpoint 'DELETE /requests/:id' { Invoke-Api DELETE "/requests/$reqId" -Headers $headers }

# ─── DONORS ─────────────────────────────────────────────────────────────────
Test-Endpoint 'GET /donors/nearby' { Invoke-Api GET '/donors/nearby?lat=24.8607&lng=67.0011&radius_km=50' -Headers $headers }
Test-Endpoint 'GET /donors/leaderboard' { Invoke-Api GET '/donors/leaderboard?scope=global&limit=10' -Headers $headers }
Test-Endpoint 'GET /donors/:id' { Invoke-Api GET "/donors/$userId" -Headers $headers }

# ─── DONATIONS ──────────────────────────────────────────────────────────────
$donBody = @{ hospital_name = 'Test Hospital'; donation_date = '2026-04-24'; blood_type = 'O+'; component = 'whole'; units = 1 }
$r = Test-Endpoint 'POST /donations' { Invoke-Api POST '/donations' -Headers $headers -Body $donBody } -Expect @(201)
$donId = ($r.Content | ConvertFrom-Json).data.id

Test-Endpoint 'GET /donations/mine' { Invoke-Api GET '/donations/mine' -Headers $headers }
Test-Endpoint 'GET /donations/stats' { Invoke-Api GET '/donations/stats' -Headers $headers }
Test-Endpoint 'DELETE /donations/:id' { Invoke-Api DELETE "/donations/$donId" -Headers $headers }

# ─── CHAT ───────────────────────────────────────────────────────────────────
$reqBody2 = @{
  blood_type = 'A+'; units_needed = 1; hospital_name = 'Chat Test Hospital'
  hospital_lat = 24.89; hospital_lng = 67.06; urgency = 'normal'; expires_in_hours = 24
}
$r = Test-Endpoint 'POST /requests (for chat)' { Invoke-Api POST '/requests' -Headers $headers -Body $reqBody2 } -Expect @(201)
$chatReqId = ($r.Content | ConvertFrom-Json).data.id

Test-Endpoint 'GET /chats' { Invoke-Api GET '/chats' -Headers $headers }
Test-Endpoint 'GET /chats/:requestId (as recipient — should 200)' { Invoke-Api GET "/chats/$chatReqId" -Headers $headers }
Test-Endpoint 'POST /chats/:requestId/messages' { Invoke-Api POST "/chats/$chatReqId/messages" -Headers $headers -Body @{ msg_type = 'text'; content = 'Hello from PowerShell' } } -Expect @(201)
Test-Endpoint 'GET /chats/:requestId/messages' { Invoke-Api GET "/chats/$chatReqId/messages" -Headers $headers }
Test-Endpoint 'PUT /chats/:requestId/read' { Invoke-Api PUT "/chats/$chatReqId/read" -Headers $headers }

# ─── HOSPITALS ──────────────────────────────────────────────────────────────
$r = Test-Endpoint 'GET /hospitals' { Invoke-Api GET '/hospitals?lat=24.8607&lng=67.0011' -Headers $headers }
$hospitals = ($r.Content | ConvertFrom-Json).data
if ($hospitals -and $hospitals.Count -gt 0) {
  $hid = $hospitals[0].id
  Test-Endpoint 'GET /hospitals/:id' { Invoke-Api GET "/hospitals/$hid" -Headers $headers }
  Test-Endpoint 'PUT /hospitals/:id/stock' { Invoke-Api PUT "/hospitals/$hid/stock" -Headers $headers -Body @{ stock = @{ 'A+' = 10; 'O-' = 3 } } }
} else {
  Write-Host '(no hospitals seeded — skipping /:id endpoints)' -ForegroundColor Yellow
}

# ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
Test-Endpoint 'GET /notifications' { Invoke-Api GET '/notifications' -Headers $headers }
Test-Endpoint 'PUT /notifications/read-all' { Invoke-Api PUT '/notifications/read-all' -Headers $headers }
Test-Endpoint 'GET /notifications/prefs' { Invoke-Api GET '/notifications/prefs' -Headers $headers }
Test-Endpoint 'PUT /notifications/prefs' { Invoke-Api PUT '/notifications/prefs' -Headers $headers -Body @{ radius_km = 50; blood_types = @('O+', 'O-'); enabled = $true } }

# ─── EVENTS ─────────────────────────────────────────────────────────────────
$r = Test-Endpoint 'GET /events' { Invoke-Api GET '/events' -Headers $headers }
$events = ($r.Content | ConvertFrom-Json).data
if ($events -and $events.Count -gt 0) {
  $eid = $events[0].id
  Test-Endpoint 'GET /events/:id' { Invoke-Api GET "/events/$eid" -Headers $headers }
  Test-Endpoint 'POST /events/:id/rsvp' { Invoke-Api POST "/events/$eid/rsvp" -Headers $headers }
  Test-Endpoint 'DELETE /events/:id/rsvp' { Invoke-Api DELETE "/events/$eid/rsvp" -Headers $headers }
} else {
  Write-Host '(no events seeded — skipping)' -ForegroundColor Yellow
}

# ─── LOGOUT ─────────────────────────────────────────────────────────────────
Test-Endpoint 'POST /auth/logout' { Invoke-Api POST '/auth/logout' -Headers $headers }

# ─── SUMMARY ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━") -ForegroundColor Cyan
Write-Host ("PASS: {0}   FAIL: {1}   TOTAL: {2}" -f $Pass, $Fail, ($Pass + $Fail)) -ForegroundColor $(if ($Fail -eq 0) { 'Green' } else { 'Yellow' })
Write-Host ""
