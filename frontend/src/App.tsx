import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import AdminRoute from './components/AdminRoute'
import Home from './pages/Home'
import Enrollment from './pages/Enrollment'
import Payment from './pages/Payment'
import MyEnrollments from './pages/MyEnrollments'
import EditEnrollment from './pages/EditEnrollment'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import AdminDashboard from './pages/AdminDashboard'
import AdminSettings from './pages/AdminSettings'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
          
          {/* Protected Routes */}
          <Route 
            path="/inscricao" 
            element={
              <PrivateRoute>
                <Enrollment />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/minhas-inscricoes" 
            element={
              <PrivateRoute>
                <MyEnrollments />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/enrollment/edit/:id" 
            element={
              <PrivateRoute>
                <EditEnrollment />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/payment/:enrollmentId" 
            element={
              <PrivateRoute>
                <Payment />
              </PrivateRoute>
            } 
          />
          
          {/* Admin Routes */}
          <Route 
            path="/admin" 
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            } 
          />
          <Route 
            path="/admin/settings" 
            element={
              <AdminRoute>
                <AdminSettings />
              </AdminRoute>
            } 
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
