export async function onRequest(context) {
  const { next } = context;
  return next();
}