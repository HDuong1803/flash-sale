export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  MERCHANT = 'MERCHANT',
  ADMIN = 'ADMIN'
}

export interface JwtPayload {
  sub: string
  email: string
  role: UserRole
}
