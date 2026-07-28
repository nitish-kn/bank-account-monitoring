# 1. Use an official Node.js runtime image
FROM node:22-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package.json and package-lock.json first (protects Docker build cache)
COPY package*.json ./

# 4. Install the Node.js dependencies
RUN npm install

# 5. Copy the rest of the frontend code
COPY . .

# # 6. Build the frontend application
RUN npm run build

# 7. Expose the port the app runs on
EXPOSE 5173

# 8. Command to run your application
# CMD ["npm", "run", "dev", "--", "--host"]
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]