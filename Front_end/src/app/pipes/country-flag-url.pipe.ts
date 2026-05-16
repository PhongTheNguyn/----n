import { Pipe, PipeTransform } from '@angular/core';
import { countryFlaticonPngUrl } from '../core/country-flaticon';

@Pipe({ name: 'countryFlagUrl', standalone: false })
export class CountryFlagUrlPipe implements PipeTransform {
  transform(value: string | null | undefined): string | null {
    return countryFlaticonPngUrl(value);
  }
}
