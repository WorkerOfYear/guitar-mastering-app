# FlareSolverr's image: Chrome that Cloudflare lets through, and its Python code to start it.
FROM ghcr.io/flaresolverr/flaresolverr:latest
COPY server.py /score/server.py
EXPOSE 8080
CMD ["python", "-u", "/score/server.py"]
