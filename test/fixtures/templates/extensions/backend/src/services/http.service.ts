import * as https from 'https';

export class HttpService {
  static async get(url: string): Promise<string> {
    return new Promise<string>((resolve) => {
      const req = https.request(url, (res) => {
        const chunk: string[] = [];
        res.on('data', (d) => {
          chunk.push(d);
        });
        res.on('end', () => resolve(chunk.toString()));
      });

      req.end();
    });
  }
}
