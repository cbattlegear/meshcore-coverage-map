import json
import os
import requests

# Get service host from environment variable or config.json
def get_service_host():
  # Check environment variable first
  env_host = os.getenv("SERVICE_HOST")
  if env_host:
    return env_host
  
  # Fall back to config.json
  try:
    with open("config.json", "r") as f:
      config = json.load(f)
      return config.get("service_host", "http://localhost:3000")
  except (FileNotFoundError, json.JSONDecodeError, KeyError):
    # Default fallback
    return "http://localhost:3000"

HOST = get_service_host()

def consolidate():
  try:
    # Use default maxAge (14 days) or override via environment variable
    max_age = os.getenv("CONSOLIDATE_MAX_AGE_DAYS", "14")
    resp = requests.post(HOST + f"/consolidate?maxAge={max_age}", timeout=30)
    resp.raise_for_status()
    data = resp.json()
    print(f"Consolidate returned {data}, response: {resp.status_code}")
  except requests.RequestException as e:
      print(f"Consolidate failed:{e}")


def clean_up():
  try:
    resp = requests.post(HOST + "/clean-up?op=repeaters", timeout=30)
    resp.raise_for_status()
    data = resp.json()
    print(f"Clean-up returned {data}, response: {resp.status_code}")
  except requests.RequestException as e:
      print(f"Clean-up failed:{e}")


def main():
  print(f"Using service host: {HOST}")
  consolidate()
  clean_up()


if __name__ == "__main__":
  main()