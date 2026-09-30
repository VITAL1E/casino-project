import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Loader } from 'lucide-react'
import Layout from './components/Layout'
import Home from './pages/Home'
import './App.css'

// Route-level code splitting: Home ships in the main bundle (it's the
// landing page, always needed first), everything else loads on demand so
// visiting "/" doesn't pull in the casino/game/sports bundles at all.
const Casino = lazy(() => import('./pages/Casino'))
const Sports = lazy(() => import('./pages/Sports'))
const Game = lazy(() => import('./pages/Game'))
const Promotions = lazy(() => import('./pages/Promotions'))
const Vip = lazy(() => import('./pages/Vip'))
const Challenges = lazy(() => import('./pages/Challenges'))
const Help = lazy(() => import('./pages/Help'))
const Info = lazy(() => import('./pages/Info'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Blog = lazy(() => import('./pages/Blog').then(m => ({ default: m.Blog })))
const BlogPost = lazy(() => import('./pages/Blog').then(m => ({ default: m.BlogPost })))

const RouteFallback = () => (
  <div className="route-fallback">
    <Loader size={28} className="gp-spin" />
  </div>
)

const App = () => (
  <BrowserRouter>
    <Layout>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/casino" element={<Casino />} />
          <Route path="/casino/games/:id" element={<Game />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/promotions" element={<Promotions />} />
          <Route path="/vip" element={<Vip />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/help" element={<Help />} />
          <Route path="/:slug" element={<Info />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  </BrowserRouter>
)

export default App
