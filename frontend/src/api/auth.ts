import { request } from './client'

export interface CurrentUser {
  id: string
  email: string
  displayName: string
}

export interface RegistrationInput {
  email: string
  password: string
  displayName: string
}

export interface LoginInput {
  email: string
  password: string
}

export function getCurrentUser(): Promise<CurrentUser> {
  return request<CurrentUser>('/api/me')
}

export function register(input: RegistrationInput): Promise<CurrentUser> {
  return request<CurrentUser>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function login(input: LoginInput): Promise<CurrentUser> {
  return request<CurrentUser>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function logout(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' })
}
