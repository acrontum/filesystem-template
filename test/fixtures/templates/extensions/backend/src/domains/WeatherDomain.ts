import { Weather, WeatherPostPost } from '@/http/nodegen/interfaces';
import { WeatherDomainInterface } from '@/http/nodegen/domainInterfaces/WeatherDomainInterface';
import NodegenRequest from '../http/interfaces/NodegenRequest';
import { Response } from 'express';
import WeatherDomainMock from './__mocks__/WeatherDomainMock';

class WeatherDomain implements WeatherDomainInterface {
  /**
   * Operation ID: weatherGet
   * Path middleware used see: WeatherDomainInterface.weatherGet
   * Summary: weather data
   * Description: Get the latest temperatures
   **/
  public async weatherGet(req: NodegenRequest, res: Response): Promise<void> {
    const text = await require('../services/weather.service').WeatherService.get();
    res.header('Content-Type', 'text/html');
    res.end(text);
  }

  /**
   * Operation ID: weatherPost
   * Path middleware used see: WeatherDomainInterface.weatherPost
   * Summary: weather data
   * Description: Create a new weather record.
   **/
  public async weatherPost(body: WeatherPostPost, req: NodegenRequest): Promise<Weather> {
    return WeatherDomainMock.weatherPost(body, req);
  }
}

export default new WeatherDomain();
