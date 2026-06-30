import type { FastifyReply, FastifyRequest } from "fastify"

export function openAIError(message: string, type: string, code: string) {
  return { error: { message, type, code } }
}

export function authenticateDownstream(
  request: FastifyRequest,
  reply: FastifyReply,
  publicApiKey?: string,
  adminApiKey?: string,
): boolean {
  if (!publicApiKey) return true
  const auth = request.headers.authorization
  if (auth === `Bearer ${publicApiKey}`) return true
  if (adminApiKey && auth === `Bearer ${adminApiKey}`) return true
  reply.code(401).send(openAIError("Invalid API key", "authentication_error", "invalid_api_key"))
  return false
}

export function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  adminApiKey: string,
): boolean {
  const auth = request.headers.authorization
  if (auth === `Bearer ${adminApiKey}`) return true
  reply.code(401).send(openAIError('Invalid admin API key', 'authentication_error', 'invalid_admin_api_key'))
  return false
}
