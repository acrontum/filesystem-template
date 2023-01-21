import express from 'express';

declare global {
  namespace Express {
    export interface Request {
      jwtData: any;
      originalToken: string;
      clientIp?: string;
    }
  }
}

type NodegenRequest = express.Request;
export default NodegenRequest;
