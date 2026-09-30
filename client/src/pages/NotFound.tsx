import { Link } from 'react-router-dom'
import Seo from '../components/Seo'

const NotFound = () => (
  <div className="cp-page">
    <Seo title="Page not found | STACK" description="This page does not exist." noindex />
    <h1 className="cp-h1">Page not found</h1>
    <p className="cp-intro">The page you asked for does not exist.</p>
    <Link to="/" className="btn-primary cp-btn">Back to home</Link>
  </div>
)

export default NotFound
