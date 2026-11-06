import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@fontsource/gowun-batang/korean-400.css'
import '@fontsource/gowun-batang/korean-700.css'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
