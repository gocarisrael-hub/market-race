import { createRoot } from 'react-dom/client'
import '../shared/fonts.css'
import '../shared/decor.css'
import '../shared/desk.css'
import './player.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)
