declare module '@prisma/client' {
  const PrismaClient: {
    new(): any;
  };
  export { PrismaClient };
}

export const enum BatchStatus {
  FAILED = 'FAILED',
  SUCCESS = 'SUCCESS', 
  RUNNING = 'RUNNING'
}

export const enum BatchType {
  EXTRACT = 'EXTRACT',
  TRANSFORM = 'TRANSFORM'
}