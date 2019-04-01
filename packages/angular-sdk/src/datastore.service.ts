import { Inject, Injectable } from '@angular/core';
import { init, DataStore, DataStoreType } from 'kinvey-html5-sdk/lib/src/publicApi';
import { KinveyConfigToken } from './utils';
;

@Injectable({
  providedIn: 'root'
})
export class DataStoreService {
  constructor(@Inject(KinveyConfigToken) config: any) {
    init(config);
  }

  collection(collectionName: string, type?: DataStoreType, options?: any): any {
    return DataStore.collection(collectionName, type, options);
  }
}
