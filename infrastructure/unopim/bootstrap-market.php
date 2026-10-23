<?php
// One-time local provisioning via the installed UnoPim application repositories.
// Product/configuration writes subsequently use the supported REST API only.
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$name = 'Market Hardware catalogue integration';
$repo = app(Webkul\AdminApi\Repositories\ApiKeyRepository::class);
if ($repo->findOneByField('name', $name)) {
    fwrite(STDERR, "Integration already exists; retain the original .env credentials.\n");
    exit(1);
}
Illuminate\Support\Facades\DB::transaction(function () use ($repo, $name) {
    $permissions = ['api.catalog.products', 'api.catalog.products.create', 'api.catalog.products.edit'];
    foreach (['attributes', 'attribute_groups', 'families', 'categories'] as $resource) {
        foreach (['', '.create', '.edit'] as $action) {
            $permissions[] = 'api.catalog.'.$resource.$action;
        }
    }
    $key = $repo->create(['name' => $name, 'permission_type' => 'custom', 'permissions' => $permissions]);
    $client = app(Laravel\Passport\ClientRepository::class)->createPasswordGrantClient(
        $name, config('auth.guards.api.provider', 'admins'), confidential: true
    );
    $client->forceFill(['user_id' => $key->admin_id, 'owner_type' => Webkul\User\Models\Admin::class,
        'owner_id' => $key->admin_id])->save();
    $repo->update(['oauth_client_id' => $client->getKey()], $key->id);
    echo json_encode(['UNOPIM_CLIENT_ID' => $client->getKey(), 'UNOPIM_CLIENT_SECRET' => $client->plainSecret,
        'UNOPIM_USERNAME' => $key->plainEmail, 'UNOPIM_PASSWORD' => $key->plainPassword]);
});
