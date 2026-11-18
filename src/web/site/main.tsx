import { createRoot } from 'react-dom/client'
import '../shared/fonts.css'

function App() {
  return <main style={{ padding: 24, fontFamily: 'Heebo, sans-serif' }}>[שם המותג]</main>
}

createRoot(document.getElementById('root')!).render(<App />)
