import { createContext, useContext } from 'react'

// App-wide actions pages can trigger: { toast, openRules, openPlayer, openTicket, openWinners }.
export const UIContext = createContext(null)
export const useUI = () => useContext(UIContext)
