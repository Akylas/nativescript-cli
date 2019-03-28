import { ConfigKey, setConfig } from './config';
import { SessionStore, HttpAdapter } from './http';
import { KinveyConfig } from './kinvey';
import { Popup } from './user/mic/popup';
import { StorageAdapter } from './storage';

export interface Config {
  kinveyConfig: KinveyConfig;
  httpAdapter: HttpAdapter;
  sessionStore: SessionStore;
  popup: Popup,
  storageAdapter: StorageAdapter
}

export function init(config: Config) {
  setConfig(ConfigKey.KinveyConfig, config.kinveyConfig);
  setConfig(ConfigKey.HttpAdapter, config.httpAdapter);
  setConfig(ConfigKey.SessionStore, config.sessionStore);
  setConfig(ConfigKey.Popup, config.popup);
  setConfig(ConfigKey.StorageAdapter, config.storageAdapter);
  return config;
}
