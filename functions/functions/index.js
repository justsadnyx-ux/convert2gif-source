import { handleInteractionRequest } from './_lib/slash.js';

const GITHUB_REPO = 'https://github.com/justsadnyx-ux/convert2gif-source';

export function onRequestGet() {
  return new Response(null, { status: 302, headers: { Location: GITHUB_REPO } });
}

export async function onRequestPost(context) {
  return handleInteractionRequest(context);
}