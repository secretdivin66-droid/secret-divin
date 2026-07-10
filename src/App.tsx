import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PrivateRoute } from './components/PrivateRoute';
import { AdminRoute } from './components/AdminRoute';

import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ConfidentialitePage } from './pages/ConfidentialitePage';
import { ConditionsPage } from './pages/ConditionsPage';
import { MentionsLegalesPage } from './pages/MentionsLegalesPage';
import { RemboursementPage } from './pages/RemboursementPage';
import { FonctionnalitesPage } from './pages/FonctionnalitesPage';
import { CreditsPage } from './pages/CreditsPage';
import { BlogPage } from './pages/BlogPage';
import { BlogArticlePage } from './pages/BlogArticlePage';
import { ContactPage } from './pages/ContactPage';
import { MaraboutsPage } from './pages/MaraboutsPage';
import { MaraboutProfilPage } from './pages/MaraboutProfilPage';
import { MaraboutInscriptionPage } from './pages/MaraboutInscriptionPage';

import { DashboardPage } from './pages/DashboardPage';
import { PoidsMystiquePage } from './pages/PoidsMystiquePage';
import { DestinPage } from './pages/DestinPage';
import { JoursPage } from './pages/JoursPage';
import { SecretsPage } from './pages/SecretsPage';
import { CarresMagiquesPage } from './pages/CarresMagiquesPage';
import { GeomanciePage } from './pages/GeomanciePage';
import { RevesPage } from './pages/RevesPage';
import { PlantesPage } from './pages/PlantesPage';
import { CompatibilitePage } from './pages/CompatibilitePage';
import { AttraperPage } from './pages/AttraperPage';
import { TutorielsPage } from './pages/TutorielsPage';
import { FormationPage } from './pages/FormationPage';
import { ProfilPage } from './pages/ProfilPage';
import { AdminPage } from './pages/AdminPage';
import { MaraboutDashboardPage } from './pages/MaraboutDashboardPage';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Routes publiques */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/fonctionnalites" element={<FonctionnalitesPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogArticlePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/marabouts" element={<MaraboutsPage />} />
        <Route path="/marabouts/inscrire" element={<MaraboutInscriptionPage />} />
        <Route path="/marabouts/:id" element={<MaraboutProfilPage />} />
        <Route path="/confidentialite" element={<ConfidentialitePage />} />
        <Route path="/conditions" element={<ConditionsPage />} />
        <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
        <Route path="/remboursement" element={<RemboursementPage />} />

        {/* Routes protégées */}
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/poids-mystique" element={<PrivateRoute><PoidsMystiquePage /></PrivateRoute>} />
        <Route path="/destin" element={<PrivateRoute><DestinPage /></PrivateRoute>} />
        <Route path="/jours" element={<PrivateRoute><JoursPage /></PrivateRoute>} />
        <Route path="/secrets" element={<PrivateRoute><SecretsPage /></PrivateRoute>} />
        <Route path="/carres-magiques" element={<PrivateRoute><CarresMagiquesPage /></PrivateRoute>} />
        <Route path="/geomancie" element={<PrivateRoute><GeomanciePage /></PrivateRoute>} />
        <Route path="/reves" element={<PrivateRoute><RevesPage /></PrivateRoute>} />
        <Route path="/plantes" element={<PrivateRoute><PlantesPage /></PrivateRoute>} />
        <Route path="/compatibilite" element={<PrivateRoute><CompatibilitePage /></PrivateRoute>} />
        <Route path="/attraper" element={<PrivateRoute><AttraperPage /></PrivateRoute>} />
        <Route path="/tutoriels" element={<PrivateRoute><TutorielsPage /></PrivateRoute>} />
        <Route path="/formation" element={<PrivateRoute><FormationPage /></PrivateRoute>} />
        <Route path="/profil" element={<PrivateRoute><ProfilPage /></PrivateRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/marabout-dashboard" element={<PrivateRoute><MaraboutDashboardPage /></PrivateRoute>} />
      </Route>
    </Routes>
  );
}

export default App;
