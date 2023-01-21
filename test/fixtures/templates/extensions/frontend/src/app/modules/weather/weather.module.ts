import { NgModule } from '@angular/core';
import { WeatherComponent } from './weather.component';
import { CommonModule } from '@angular/common';

@NgModule({
  imports: [CommonModule],
  declarations: [WeatherComponent],
  exports: [WeatherComponent],
})
export class WeatherModule {}
