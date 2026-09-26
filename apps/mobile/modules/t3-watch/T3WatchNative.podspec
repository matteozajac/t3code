require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'T3WatchNative'
  s.version = package['version']
  s.summary = 'Apple Watch companion bridge for T3 Code mobile.'
  s.description = 'Passes task snapshots and explicit watch actions through the existing mobile session.'
  s.homepage = 'https://github.com/matteozajac/t3code'
  s.license = { :type => 'MIT' }
  s.author = 'Mateusz Zajac'
  s.platforms = { :ios => '18.0' }
  s.source = { :path => '.' }
  s.source_files = 'ios/**/*.swift'
  s.frameworks = 'WatchConnectivity'
  s.swift_version = '6.0'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_STRICT_CONCURRENCY' => 'complete',
    'SWIFT_DEFAULT_ACTOR_ISOLATION' => 'nonisolated'
  }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
end
