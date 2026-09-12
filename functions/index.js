import { handleInteractionRequest } from './_lib/slash.js';

export async function onRequestPost(context) {
  return handleInteractionRequest(context);
}