import requests

BASE_URL = "http://127.0.0.1:8000/api"

print("--- Testing API Endpoints ---")

# 1. Create a user
print("\n1. Creating User...")
user_data = {
    "email": "test@example.com",
    "password": "securepassword123"
}
response = requests.post(f"{BASE_URL}/users/", json=user_data)
if response.status_code == 200:
    print("SUCCESS: User created:", response.json())
elif response.status_code == 400:
    print("SUCCESS (Handled): User already exists.", response.json())
else:
    print("FAILED: Failed to create user.", response.status_code, response.text)

# 2. Login to get token
print("\n2. Logging In...")
login_data = {
    "username": "test@example.com",
    "password": "securepassword123"
}
response = requests.post(f"{BASE_URL}/auth/login", data=login_data)
token = None
if response.status_code == 200:
    token = response.json().get("access_token")
    print("SUCCESS: Logged in and received token.")
else:
    print("FAILED: Failed to log in.", response.status_code, response.text)

# 3. Use token to get current user
print("\n3. Testing Protected Endpoint (/users/me)...")
if token:
    headers = {
        "Authorization": f"Bearer {token}"
    }
    response = requests.get(f"{BASE_URL}/users/me", headers=headers)
    if response.status_code == 200:
        print("SUCCESS: Retrieved current user:", response.json())
    else:
        print("FAILED: Failed to fetch current user.", response.status_code, response.text)
else:
    print("SKIPPED: Missing token from step 2.")
