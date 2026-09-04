import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { createAuthClient } from './store/appwriteAuth.ts'
import { registerServiceWorker } from './lib/serviceWorker'

const APPWRITE_CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: '6a92d8e0002e9b585e39',
  databaseId: '6a92dad20003b47b4a19',
  tableId: 'key-value',
  bucketId: '6a92dd0f003962ea7128',
}

const account = createAuthClient(APPWRITE_CONFIG)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate account={account} storeConfig={APPWRITE_CONFIG}>
      <App />
    </AuthGate>
  </StrictMode>,
)

registerServiceWorker(() => {
  // Der Toast-Hinweis "Neue Version geladen…" lebt innerhalb der React-App und kann von hier
  // aus (außerhalb des Component-Baums) nicht direkt angesprochen werden - ein simples
  // console.log genügt hier, da ohnehin ein Reload unmittelbar folgt.
  console.log('Neue Version gefunden, lade neu…');
})
