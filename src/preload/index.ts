import { contextBridge } from 'electron'
import { API_KEY, type Api } from '@shared/api'

const api: Api = {}

contextBridge.exposeInMainWorld(API_KEY, api)
