import { HttpService } from './http.service';

export class WeatherService {
  static async get(): Promise<string> {
    const weather = (await HttpService.get('https://wttr.in')).split('\n');

    let parsed = '';
    while (weather.length) {
      let line = weather.shift();
      if (line === '<style type="text/css">' || line === '<pre>') {
        while (line !== '</style>' && line !== '</pre>') {
          parsed += line + '\n';
          line = weather.shift();
        }
        parsed += line + '\n';
      }
    }

    return parsed;
  }
}
