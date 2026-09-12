import { GatewayBotV5 } from './bot.js';

const POLL_URL = 'https://convert2gif.pages.dev/api/poll';

export default {
  async scheduled(event, env, ctx) {
    const id = env.GATEWAY.idFromName('convert2gif');
    const stub = env.GATEWAY.get(id);
    await stub.fetch('https://do/keepalive').catch(() => {});
  },

  async fetch(request, env, ctx) {
    const id = env.GATEWAY.idFromName('convert2gif');
    const stub = env.GATEWAY.get(id);
    return stub.fetch(request);
  },
};

export { GatewayBotV5 };