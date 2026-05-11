let counter = 0

export const createId = (): string => `mock-id-${++counter}`

export const init = () => createId
