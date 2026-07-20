# FastAPI backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install python dependencies directly using pre-compiled wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

# Copy backend source code
COPY . .

# Expose backend port
EXPOSE 8000

# Start FastAPI app using uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
