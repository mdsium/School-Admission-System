#!/bin/sh
# Writes the browser-side runtime config from the API_URL env var.
echo "window.__CONFIG__ = { API_URL: \"${API_URL:-http://localhost:8080}\" };" > /usr/share/nginx/html/config.js
