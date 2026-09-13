# Convert2GIF — self-host the bot anywhere (Rewrite of similar projects'
# Docker hosting into our stack). Runs the /gif bot standalone in a container.
# Config: mount a volume at /data and place config.json + control.json there,
# or point CONVERT2GIF_USERDATA at it.
FROM node:22-alpine

WORKDIR /opt/convert2gif

RUN addgroup -S c2g && adduser -S c2g -G c2g

COPY app/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY app/ ./

RUN mkdir -p /data && chown -R c2g:c2g /data /opt/convert2gif

ENV CONVERT2GIF_USERDATA=/data
ENV NODE_ENV=production

USER c2g

VOLUME ["/data"]

EXPOSE 39579

CMD ["node", "bot.js"]