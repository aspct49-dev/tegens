import { Component } from 'react'

// Catches a page (or admin section) that fails to load or crashes while drawing, so the rest of
// the site (top bar, menu, footer) stays up and the visitor gets a way out instead of a blank
// screen. Keyed by the page's address in App.jsx, so moving to another page clears it.
export default class PageError extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[page]', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className={this.props.className ?? 'titled-page'}>
        <div className="empty-state page-error" role="alert">
          <img className="empty-state-icon" src="/assets/tgn-logo.png" width="52" height="35" alt="" />
          <p className="empty-state-title">This page didn’t load</p>
          <p className="empty-state-text">The site may have just been updated, or the connection dropped. Reloading usually fixes it.</p>
          <div className="empty-state-actions">
            <button type="button" className="btn-blue" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
