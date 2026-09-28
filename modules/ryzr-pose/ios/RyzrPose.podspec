Pod::Spec.new do |s|
  s.name           = 'RyzrPose'
  s.version        = '1.0.0'
  s.summary        = 'Apple Vision body-pose frame processor plugin for the RYZR Form Coach'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'RYZR'
  s.homepage       = 'https://ryzrapp.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'VisionCamera'
  s.frameworks = 'Vision', 'CoreMedia', 'CoreVideo'

  s.source_files = '**/*.{h,m}'
end
