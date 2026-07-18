FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create necessary directories and set permissions for nginx user
RUN mkdir -p /usr/share/nginx/html /var/cache/nginx /var/run /var/log/nginx && \
    chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

# Use nginx user (non-root)
USER nginx

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/api/chat/health || exit 1
