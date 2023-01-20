import { Component } from '@angular/core';
import { Subject } from 'rxjs';

@Component({
  selector: 'weather',
  templateUrl: './weather.component.html',
  styleUrls: ['./weather.component.css'],
})
export class WeatherComponent {
  weather$ = new Subject<string>();

  constructor() {
    fetch('http://localhost:5000/v1/weather').then(async (res) => {
      const [style, content] = (await res.text()).split('</style>');
      const styleEl = document.createElement('style');
      styleEl.type = 'text/css';
      styleEl.innerText = style.replace(/^<style>/, '');
      document.head.appendChild(styleEl);

      this.weather$.next(content);
    });
  }
}
