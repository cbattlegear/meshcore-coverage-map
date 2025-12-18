FROM python:3.11-slim

WORKDIR /app

# Install Node.js and npm for meshcore-decoder
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g @michaelhart/meshcore-decoder && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir paho-mqtt requests haversine cryptography

# Copy scraper files
COPY wardrive-mqtt.py .
COPY auth_token.py .
COPY config.json .

# Run the scraper
CMD ["python", "wardrive-mqtt.py"]

