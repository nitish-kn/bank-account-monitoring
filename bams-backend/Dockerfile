# 1. Use an official lightweight Python image
FROM python:3.14.5

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy just the requirements file first (protects Docker build cache)
COPY requirements.txt .

# 4. Install the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy the rest of the application code
COPY . .

# 6. Expose the port the app runs on
EXPOSE 8000

# 7. Command to run your application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]